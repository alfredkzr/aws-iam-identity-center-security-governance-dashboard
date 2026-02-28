"""
Athena Proxy Lambda — Query Lifecycle + Fast-Load Cache

Handles frontend requests for assignment data:
  1. Checks S3 cache for pre-rendered summary.json (fast path)
  2. Falls back to running an Athena SQL query (slow path)
  3. Caches the results for subsequent requests
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

import boto3
from botocore.config import Config

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
INVENTORY_BUCKET = os.environ.get("INVENTORY_BUCKET", "")
ATHENA_RESULTS_BUCKET = os.environ.get("ATHENA_RESULTS_BUCKET", "")
CACHE_BUCKET = os.environ.get("CACHE_BUCKET", "")
ATHENA_WORKGROUP = os.environ.get("ATHENA_WORKGROUP", "")
ATHENA_DATABASE = os.environ.get("ATHENA_DATABASE", "")
ATHENA_TABLE = os.environ.get("ATHENA_TABLE", "assignments")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

CACHE_KEY = "summary.json"
CACHE_MAX_AGE_SECONDS = 3600  # 1 hour

# Valid query types — allowlist to prevent abuse
VALID_QUERY_TYPES = {"all", "summary", "dates"}

# Validate table name at cold-start to prevent SQL injection
_TABLE_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
if not _TABLE_NAME_PATTERN.match(ATHENA_TABLE):
    raise ValueError(
        f"Invalid ATHENA_TABLE name '{ATHENA_TABLE}'. "
        "Must match pattern: ^[a-zA-Z_][a-zA-Z0-9_]*$"
    )

# Boto3 clients
boto_config = Config(retries={"max_attempts": 5, "mode": "adaptive"})
athena = boto3.client("athena", config=boto_config)
s3 = boto3.client("s3", config=boto_config)


def lambda_handler(event, context):
    """Main entry point — returns assignment data as JSON with CORS headers."""
    try:
        # Determine the query type from the request
        query_type = _get_query_type(event)
        logger.info(f"Request query_type={query_type}")

        # Validate query type against allowlist
        if query_type not in VALID_QUERY_TYPES:
            logger.warning(f"Invalid query_type received: {query_type}")
            return _response(400, {"error": f"Invalid query type. Must be one of: {', '.join(VALID_QUERY_TYPES)}"})

        # Fast path: list available dates quickly directly from S3
        if query_type == "dates":
            dates = _get_available_dates()
            return _response(200, {"dates": dates})

        # Extract snapshot date (if provided)
        snapshot_date = _get_snapshot_date(event)
        logger.info(f"Target snapshot_date={snapshot_date}")

        # Fast path: check cache first
        cached = _get_cached_summary(snapshot_date)
        if cached is not None:
            logger.info("Cache hit — returning cached summary")
            return _response(200, cached)

        # Slow path: run Athena query
        logger.info("Cache miss — running Athena query")
        results = _run_athena_query(query_type, snapshot_date)

        # Build summary and cache it
        summary = _build_summary(results, snapshot_date)
        _put_cached_summary(summary, snapshot_date)

        return _response(200, summary)

    except Exception as exc:
        logger.exception(f"Error processing request: {exc}")
        return _response(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Cache Layer
# ---------------------------------------------------------------------------
def _get_cache_key(snapshot_date):
    if snapshot_date:
        return f"summary_{snapshot_date}.json"
    return CACHE_KEY

def _get_cached_summary(snapshot_date=None):
    """Try to load summary.json from cache bucket. Returns None if stale or missing."""
    key = _get_cache_key(snapshot_date)
    try:
        response = s3.get_object(Bucket=CACHE_BUCKET, Key=key)
        last_modified = response["LastModified"]
        age = (datetime.now(timezone.utc) - last_modified).total_seconds()

        if age > CACHE_MAX_AGE_SECONDS:
            logger.info(f"Cache is stale ({age:.0f}s old)")
            return None

        body = response["Body"].read().decode("utf-8")
        return json.loads(body)

    except s3.exceptions.NoSuchKey:
        logger.info("No cache file found")
        return None
    except Exception as exc:
        logger.warning(f"Cache read failed: {exc}")
        return None


def _put_cached_summary(summary, snapshot_date=None):
    """Write summary.json to cache bucket."""
    key = _get_cache_key(snapshot_date)
    try:
        s3.put_object(
            Bucket=CACHE_BUCKET,
            Key=key,
            Body=json.dumps(summary, default=str).encode("utf-8"),
            ContentType="application/json",
        )
        logger.info("Summary cached successfully")
    except Exception as exc:
        logger.warning(f"Cache write failed: {exc}")


# ---------------------------------------------------------------------------
# Athena Query Lifecycle
# ---------------------------------------------------------------------------
def _run_athena_query(query_type="all", snapshot_date=None):
    """Execute an Athena query and return the results."""
    sql = _get_query_sql(query_type, snapshot_date)

    # Start query execution
    start_response = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": ATHENA_DATABASE},
        WorkGroup=ATHENA_WORKGROUP,
    )
    query_execution_id = start_response["QueryExecutionId"]
    logger.info(f"Started Athena query: {query_execution_id}")

    # Poll for completion
    result = _wait_for_query(query_execution_id)

    if result["QueryExecution"]["Status"]["State"] != "SUCCEEDED":
        reason = result["QueryExecution"]["Status"].get("StateChangeReason", "Unknown")
        raise RuntimeError(f"Athena query failed: {reason}")

    # Fetch results
    return _fetch_results(query_execution_id)


def _wait_for_query(query_execution_id, max_wait=55):
    """Poll Athena for query completion. Max wait ~55s to stay within Lambda timeout."""
    start = time.time()
    delay = 0.5

    while True:
        response = athena.get_query_execution(QueryExecutionId=query_execution_id)
        state = response["QueryExecution"]["Status"]["State"]

        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return response

        elapsed = time.time() - start
        if elapsed > max_wait:
            athena.stop_query_execution(QueryExecutionId=query_execution_id)
            raise TimeoutError(f"Athena query timed out after {max_wait}s")

        time.sleep(min(delay, max_wait - elapsed))
        delay = min(delay * 1.5, 5)  # Exponential backoff, max 5s


def _fetch_results(query_execution_id):
    """Fetch all result rows from a completed Athena query."""
    rows = []
    kwargs = {"QueryExecutionId": query_execution_id, "MaxResults": 1000}
    headers = None

    while True:
        response = athena.get_query_results(**kwargs)
        result_rows = response["ResultSet"]["Rows"]

        for row in result_rows:
            values = [col.get("VarCharValue", "") for col in row["Data"]]
            if headers is None:
                headers = values  # First row is column headers
            else:
                rows.append(dict(zip(headers, values)))

        next_token = response.get("NextToken")
        if not next_token:
            break
        kwargs["NextToken"] = next_token

    logger.info(f"Fetched {len(rows)} rows from Athena")
    return rows


# ---------------------------------------------------------------------------
# Query Builder
# ---------------------------------------------------------------------------
def _get_query_sql(query_type, snapshot_date):
    """Return the SQL query for the given type. Table name is validated at cold-start."""
    date_filter = f"WHERE snapshot_date = '{snapshot_date}'" if snapshot_date else ""

    if query_type == "summary":
        return f"""
            SELECT
                account_id,
                account_name,
                COUNT(*) as total_assignments,
                COUNT(DISTINCT principal_name) as unique_principals,
                COUNT(DISTINCT permission_set_name) as unique_permission_sets
            FROM {ATHENA_TABLE}
            {date_filter}
            GROUP BY account_id, account_name
            ORDER BY total_assignments DESC
        """
    else:
        return f"""
            SELECT
                account_id,
                account_name,
                principal_type,
                principal_name,
                principal_email,
                permission_set_name,
                permission_set_arn,
                group_name
            FROM {ATHENA_TABLE}
            {date_filter}
            ORDER BY account_name, principal_name
        """


# ---------------------------------------------------------------------------
# Summary Builder
# ---------------------------------------------------------------------------
def _build_summary(rows, snapshot_date=None):
    """Build a summary object from query results."""
    accounts = set()
    principals = set()
    permission_sets = set()

    for row in rows:
        accounts.add(row.get("account_id", ""))
        principals.add(row.get("principal_name", ""))
        permission_sets.add(row.get("permission_set_name", ""))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_date": snapshot_date,
        "stats": {
            "total_assignments": len(rows),
            "total_accounts": len(accounts),
            "total_principals": len(principals),
            "total_permission_sets": len(permission_sets),
        },
        "assignments": rows,
    }


# ---------------------------------------------------------------------------
# HTTP Response Helper
# ---------------------------------------------------------------------------
def _get_query_type(event):
    """Extract query type from Lambda Function URL event."""
    params = event.get("queryStringParameters") or {}
    return params.get("type", "all")

def _get_snapshot_date(event):
    """Extract requested snapshot date, sanitize it to YYYY-MM-DD."""
    params = event.get("queryStringParameters") or {}
    date_str = params.get("date")
    if date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    return None

def _get_available_dates():
    """List out snapshot dates directly from S3 by finding common prefixes."""
    try:
        response = s3.list_objects_v2(
            Bucket=INVENTORY_BUCKET,
            Prefix="assignments/snapshot_date=",
            Delimiter="/"
        )
        prefixes = response.get("CommonPrefixes", [])
        
        dates = []
        for prefix in prefixes:
            # prefix is like "assignments/snapshot_date=2024-03-01/"
            match = re.search(r"snapshot_date=(\d{4}-\d{2}-\d{2})", prefix["Prefix"])
            if match:
                dates.append(match.group(1))
        
        # Return sorted descending (newest first)
        return sorted(dates, reverse=True)
    except Exception as exc:
        logger.error(f"Failed to fetch dates from S3: {exc}")
        return []

def _cors_origin(event):
    """Determine the CORS origin to return based on the request and allowed origins."""
    if ALLOWED_ORIGIN == "*":
        return "*"

    allowed = [o.strip() for o in ALLOWED_ORIGIN.split(",")]
    request_origin = (event.get("headers") or {}).get("origin", "")

    if request_origin in allowed:
        return request_origin

    # Default to first allowed origin
    return allowed[0] if allowed else "*"


def _response(status_code, body, event=None):
    """Build a Lambda Function URL response with CORS headers."""
    origin = ALLOWED_ORIGIN if ALLOWED_ORIGIN == "*" else _cors_origin(event or {})

    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        "body": json.dumps(body, default=str),
    }

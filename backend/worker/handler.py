"""
Worker Lambda — IAM Identity Center Assignment Crawler

Handles two actions:
  1. list_accounts: Returns all accounts in the AWS Organization
  2. process_account: Crawls assignments for a single account, writes CSV to S3
"""

import csv
import io
import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.config import Config

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
SSO_INSTANCE_ARN = os.environ.get("SSO_INSTANCE_ARN", "")
IDENTITY_STORE_ID = os.environ.get("IDENTITY_STORE_ID", "")
INVENTORY_BUCKET = os.environ.get("INVENTORY_BUCKET", "")

# Boto3 clients with retry config
boto_config = Config(retries={"max_attempts": 5, "mode": "adaptive"})
sso_admin = boto3.client("sso-admin", config=boto_config)
identity_store = boto3.client("identitystore", config=boto_config)
organizations = boto3.client("organizations", config=boto_config)
s3 = boto3.client("s3", config=boto_config)

# Caches for resolved identities (avoid repeat API calls within same invocation)
_user_cache = {}
_group_cache = {}
_group_members_cache = {}
_permission_set_cache = {}


def lambda_handler(event, context):
    """Main Lambda entry point — routes to action handler."""
    action = event.get("action", "process_account")

    if action == "list_accounts":
        return handle_list_accounts()
    elif action == "process_account":
        return handle_process_account(event)
    else:
        raise ValueError(f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Action: List Accounts
# ---------------------------------------------------------------------------
def handle_list_accounts():
    """Fetch all accounts in the AWS Organization using paginator."""
    logger.info("Listing all accounts in the organization")

    accounts = []
    paginator = organizations.get_paginator("list_accounts")

    for page in paginator.paginate():
        for account in page["Accounts"]:
            if account["Status"] == "ACTIVE":
                accounts.append({
                    "account_id": account["Id"],
                    "account_name": account.get("Name", "Unknown"),
                })

    logger.info(f"Found {len(accounts)} active accounts")
    return {"accounts": accounts}


# ---------------------------------------------------------------------------
# Action: Process Account
# ---------------------------------------------------------------------------
def handle_process_account(event):
    """Crawl IAM Identity Center assignments for a single account and write CSV to S3."""
    account = event.get("account", {})
    account_id = account.get("account_id", "")
    account_name = account.get("account_name", "Unknown")

    if not account_id:
        raise ValueError("Missing account_id in event")

    logger.info(f"Processing account: {account_id} ({account_name})")

    # Step 1: Get all permission sets
    permission_sets = list_permission_sets()

    # Step 2: For each permission set, get account assignments
    assignments = []
    for ps_arn in permission_sets:
        ps_name = resolve_permission_set(ps_arn)
        account_assignments = list_account_assignments(account_id, ps_arn)

        for assignment in account_assignments:
            principal = resolve_principal(
                assignment["PrincipalType"],
                assignment["PrincipalId"],
            )
            now_iso = datetime.now(timezone.utc).isoformat()

            # Keep original assignment row
            assignments.append({
                "account_id": account_id,
                "account_name": account_name,
                "principal_type": assignment["PrincipalType"],
                "principal_id": assignment["PrincipalId"],
                "principal_name": principal.get("name", "Unknown"),
                "principal_email": principal.get("email", ""),
                "permission_set_name": ps_name,
                "permission_set_arn": ps_arn,
                "group_name": "",
                "created_date": now_iso,
            })

            # If GROUP, expand members into USER_VIA_GROUP rows
            if assignment["PrincipalType"] == "GROUP":
                group_name = principal.get("name", "Unknown")
                members = list_group_members(assignment["PrincipalId"])
                for member in members:
                    assignments.append({
                        "account_id": account_id,
                        "account_name": account_name,
                        "principal_type": "USER_VIA_GROUP",
                        "principal_id": member["user_id"],
                        "principal_name": member.get("name", "Unknown"),
                        "principal_email": member.get("email", ""),
                        "permission_set_name": ps_name,
                        "permission_set_arn": ps_arn,
                        "group_name": group_name,
                        "created_date": now_iso,
                    })

    # Step 3: Write CSV to S3
    if assignments:
        write_csv_to_s3(account_id, assignments)

    logger.info(
        f"Account {account_id}: found {len(assignments)} assignments "
        f"across {len(permission_sets)} permission sets"
    )

    return {
        "status": "success",
        "account_id": account_id,
        "assignment_count": len(assignments),
    }


# ---------------------------------------------------------------------------
# SSO Admin Helpers
# ---------------------------------------------------------------------------
def list_permission_sets():
    """List all permission sets in the SSO instance using paginator."""
    permission_sets = []
    paginator = sso_admin.get_paginator("list_permission_sets")

    for page in paginator.paginate(InstanceArn=SSO_INSTANCE_ARN):
        permission_sets.extend(page.get("PermissionSets", []))

    return permission_sets


def list_account_assignments(account_id, permission_set_arn):
    """List all assignments for an account + permission set combo using paginator."""
    assignments = []
    paginator = sso_admin.get_paginator("list_account_assignments")

    for page in paginator.paginate(
        InstanceArn=SSO_INSTANCE_ARN,
        AccountId=account_id,
        PermissionSetArn=permission_set_arn,
    ):
        assignments.extend(page.get("AccountAssignments", []))

    return assignments


def resolve_permission_set(permission_set_arn):
    """Resolve a permission set ARN to its friendly name (cached)."""
    if permission_set_arn in _permission_set_cache:
        return _permission_set_cache[permission_set_arn]

    try:
        response = sso_admin.describe_permission_set(
            InstanceArn=SSO_INSTANCE_ARN,
            PermissionSetArn=permission_set_arn,
        )
        name = response["PermissionSet"].get("Name", permission_set_arn)
    except Exception as exc:
        logger.warning(f"Failed to resolve permission set {permission_set_arn}: {exc}")
        name = permission_set_arn

    _permission_set_cache[permission_set_arn] = name
    return name


# ---------------------------------------------------------------------------
# Identity Store Helpers
# ---------------------------------------------------------------------------
def resolve_principal(principal_type, principal_id):
    """Resolve a user or group GUID to a friendly name and email."""
    if principal_type == "USER":
        return resolve_user(principal_id)
    elif principal_type == "GROUP":
        return resolve_group(principal_id)
    else:
        return {"name": principal_id, "email": ""}


def resolve_user(user_id):
    """Resolve a user GUID to name + email using identitystore (cached)."""
    if user_id in _user_cache:
        return _user_cache[user_id]

    try:
        response = identity_store.describe_user(
            IdentityStoreId=IDENTITY_STORE_ID,
            UserId=user_id,
        )
        result = {
            "name": response.get("DisplayName", response.get("UserName", user_id)),
            "email": _extract_email(response),
        }
    except Exception as exc:
        logger.warning(f"Failed to resolve user {user_id}: {exc}")
        result = {"name": user_id, "email": ""}

    _user_cache[user_id] = result
    return result


def resolve_group(group_id):
    """Resolve a group GUID to display name using identitystore (cached)."""
    if group_id in _group_cache:
        return _group_cache[group_id]

    try:
        response = identity_store.describe_group(
            IdentityStoreId=IDENTITY_STORE_ID,
            GroupId=group_id,
        )
        result = {
            "name": response.get("DisplayName", group_id),
            "email": "",
        }
    except Exception as exc:
        logger.warning(f"Failed to resolve group {group_id}: {exc}")
        result = {"name": group_id, "email": ""}

    _group_cache[group_id] = result
    return result


def list_group_members(group_id):
    """List all users in a group and resolve each to name + email (cached)."""
    if group_id in _group_members_cache:
        return _group_members_cache[group_id]

    members = []
    try:
        paginator = identity_store.get_paginator("list_group_memberships")
        for page in paginator.paginate(
            IdentityStoreId=IDENTITY_STORE_ID,
            GroupId=group_id,
        ):
            for membership in page.get("GroupMemberships", []):
                member_id = membership.get("MemberId", {})
                user_id = member_id.get("UserId")
                if user_id:
                    user_info = resolve_user(user_id)
                    members.append({
                        "user_id": user_id,
                        "name": user_info.get("name", user_id),
                        "email": user_info.get("email", ""),
                    })
    except Exception as exc:
        logger.warning(f"Failed to list members of group {group_id}: {exc}")

    _group_members_cache[group_id] = members
    logger.info(f"Group {group_id}: resolved {len(members)} members")
    return members


def _extract_email(user_response):
    """Extract primary email from DescribeUser response."""
    emails = user_response.get("Emails", [])
    for email in emails:
        if email.get("Primary", False):
            return email.get("Value", "")
    if emails:
        return emails[0].get("Value", "")
    return ""


# ---------------------------------------------------------------------------
# S3 Output
# ---------------------------------------------------------------------------
CSV_HEADERS = [
    "account_id",
    "account_name",
    "principal_type",
    "principal_id",
    "principal_name",
    "principal_email",
    "permission_set_name",
    "permission_set_arn",
    "group_name",
    "created_date",
]


def write_csv_to_s3(account_id, assignments):
    """Write assignment records as CSV to the inventory S3 bucket."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_HEADERS)
    writer.writeheader()
    writer.writerows(assignments)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = f"assignments/snapshot_date={today}/{account_id}.csv"
    s3.put_object(
        Bucket=INVENTORY_BUCKET,
        Key=key,
        Body=output.getvalue().encode("utf-8"),
        ContentType="text/csv",
    )
    logger.info(f"Wrote {len(assignments)} rows to s3://{INVENTORY_BUCKET}/{key}")

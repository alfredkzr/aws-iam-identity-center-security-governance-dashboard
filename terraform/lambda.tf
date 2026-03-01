# -----------------------------------------------------------------------------
# Lambda Packaging
# -----------------------------------------------------------------------------

data "archive_file" "worker_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/worker"
  output_path = "${path.module}/../backend/worker.zip"
}

data "archive_file" "athena_proxy_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/athena_proxy"
  output_path = "${path.module}/../backend/athena_proxy.zip"
}

# -----------------------------------------------------------------------------
# Worker Lambda
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "worker" {
  function_name    = "${var.resource_prefix}-worker"
  description      = "Crawls IAM Identity Center assignments for a single AWS account"
  filename         = data.archive_file.worker_lambda.output_path
  source_code_hash = data.archive_file.worker_lambda.output_base64sha256
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  architectures    = ["arm64"]
  timeout          = 300
  memory_size      = 256
  role             = aws_iam_role.worker_lambda.arn

  environment {
    variables = {
      SSO_INSTANCE_ARN  = var.sso_instance_arn
      IDENTITY_STORE_ID = var.identity_store_id
      INVENTORY_BUCKET  = aws_s3_bucket.inventory.id
    }
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${aws_lambda_function.worker.function_name}"
  retention_in_days = var.log_retention_days
}

# -----------------------------------------------------------------------------
# Athena Proxy Lambda
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "athena_proxy" {
  function_name    = "${var.resource_prefix}-athena-proxy"
  description      = "Handles Athena query lifecycle with fast-load cache for the frontend"
  filename         = data.archive_file.athena_proxy_lambda.output_path
  source_code_hash = data.archive_file.athena_proxy_lambda.output_base64sha256
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  architectures    = ["arm64"]
  timeout          = 60
  memory_size      = 256
  role             = aws_iam_role.athena_proxy_lambda.arn

  environment {
    variables = {
      INVENTORY_BUCKET      = aws_s3_bucket.inventory.id
      ATHENA_RESULTS_BUCKET = aws_s3_bucket.athena_results.id
      CACHE_BUCKET          = aws_s3_bucket.cache.id
      ATHENA_WORKGROUP      = aws_athena_workgroup.main.name
      ATHENA_DATABASE       = "${replace(var.resource_prefix, "-", "_")}_db"
      ATHENA_TABLE          = "assignments"
      ALLOWED_ORIGIN        = join(",", var.allowed_origins)
    }
  }
}

resource "aws_cloudwatch_log_group" "athena_proxy" {
  name              = "/aws/lambda/${aws_lambda_function.athena_proxy.function_name}"
  retention_in_days = var.log_retention_days
}

# -----------------------------------------------------------------------------
# Athena Proxy — Lambda Function URL (HTTPS endpoint for frontend)
# -----------------------------------------------------------------------------

resource "aws_lambda_function_url" "athena_proxy" {
  function_name      = aws_lambda_function.athena_proxy.function_name
  authorization_type = var.lambda_url_auth_type

  cors {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

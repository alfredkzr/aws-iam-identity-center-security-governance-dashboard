# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "inventory_bucket" {
  description = "S3 bucket for assignment inventory (CSV)"
  value       = aws_s3_bucket.inventory.id
}

output "athena_results_bucket" {
  description = "S3 bucket for Athena query results"
  value       = aws_s3_bucket.athena_results.id
}

output "cache_bucket" {
  description = "S3 bucket for fast-load cache"
  value       = aws_s3_bucket.cache.id
}

output "worker_lambda_arn" {
  description = "ARN of the worker Lambda function"
  value       = aws_lambda_function.worker.arn
}

output "athena_proxy_lambda_arn" {
  description = "ARN of the Athena proxy Lambda function"
  value       = aws_lambda_function.athena_proxy.arn
}

output "athena_proxy_url" {
  description = "Function URL for the Athena Proxy Lambda (frontend API endpoint)"
  value       = aws_lambda_function_url.athena_proxy.function_url
}

output "step_functions_arn" {
  description = "ARN of the Step Functions state machine"
  value       = aws_sfn_state_machine.crawler.arn
}

output "athena_workgroup" {
  description = "Athena workgroup name"
  value       = aws_athena_workgroup.main.name
}

output "amplify_app_id" {
  description = "Amplify App ID"
  value       = aws_amplify_app.frontend.id
}

output "amplify_default_domain" {
  description = "Amplify default domain URL"
  value       = aws_amplify_app.frontend.default_domain
}

output "aws_region" {
  description = "AWS region deployed to"
  value       = var.aws_region
}

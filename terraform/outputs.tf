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
  description = "CloudFront endpoint for the Athena Proxy API"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}/api"
}

output "step_functions_arn" {
  description = "ARN of the Step Functions state machine"
  value       = aws_sfn_state_machine.crawler.arn
}

output "athena_workgroup" {
  description = "Athena workgroup name"
  value       = aws_athena_workgroup.main.name
}

output "frontend_url" {
  description = "CloudFront URL for the dashboard (HTTPS)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket" {
  description = "S3 bucket for the frontend static files"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "aws_region" {
  description = "AWS region deployed to"
  value       = var.aws_region
}

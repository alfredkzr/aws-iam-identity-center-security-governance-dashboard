# -----------------------------------------------------------------------------
# Core Configuration
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "resource_prefix" {
  description = "Prefix for all resource names (e.g. 'myorg-idc-gov'). Must be globally unique for S3 bucket names."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,30}$", var.resource_prefix))
    error_message = "resource_prefix must be 3-31 chars, lowercase alphanumeric and hyphens, starting with a letter or digit."
  }
}

variable "project_name" {
  description = "Project name used in resource tags"
  type        = string
  default     = "idc-governance"
}

variable "environment" {
  description = "Environment name used in resource tags (e.g. production, staging, demo)"
  type        = string
  default     = "production"
}

# -----------------------------------------------------------------------------
# IAM Identity Center
# -----------------------------------------------------------------------------

variable "sso_instance_arn" {
  description = "ARN of the IAM Identity Center (SSO) instance"
  type        = string
}

variable "identity_store_id" {
  description = "Identity Store ID associated with the SSO instance"
  type        = string
}


# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------

variable "force_destroy_buckets" {
  description = "Allow Terraform to destroy S3 buckets even if they contain objects. Set to true only for dev/demo environments."
  type        = bool
  default     = false
}


# -----------------------------------------------------------------------------
# Cost & Performance Guardrails
# -----------------------------------------------------------------------------

variable "inventory_lifecycle_days" {
  description = "Number of days before raw CSV assignments in S3 are deleted."
  type        = number
  default     = 7
}

variable "athena_results_lifecycle_days" {
  description = "Number of days before Athena query results in S3 are deleted."
  type        = number
  default     = 1
}

variable "cache_lifecycle_days" {
  description = "Number of days before fast-load cache JSONs in S3 are deleted."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention period in days"
  type        = number
  default     = 7
}

variable "crawler_schedule_interval" {
  description = "How often EventBridge triggers the crawler Step Function (e.g. '6 hours', '1 day', '12 hours'). Uses EventBridge rate() syntax."
  type        = string
  default     = "6 hours"
}

variable "worker_reserved_concurrency" {
  description = "Maximum concurrent executions for the worker Lambda. Limits blast radius and cost."
  type        = number
  default     = 10
}

variable "athena_proxy_reserved_concurrency" {
  description = "Maximum concurrent executions for the Athena proxy Lambda. Limits blast radius and cost."
  type        = number
  default     = 5
}

# -----------------------------------------------------------------------------
# Okta SSO Configuration (for frontend auth)
# -----------------------------------------------------------------------------

variable "okta_domain" {
  description = "Okta domain for SSO authentication (e.g. your-org.okta.com)"
  type        = string
  default     = ""
}

variable "okta_client_id" {
  description = "Okta OIDC application/client ID"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Local Auth Configuration (when Okta is not configured)
# -----------------------------------------------------------------------------

variable "local_admin_username" {
  description = "Username for local dashboard login (only used when Okta is not configured)"
  type        = string
  default     = "admin"
}

variable "local_admin_password" {
  description = "Password for local dashboard login (only used when Okta is not configured)"
  type        = string
  default     = "admin123"
  sensitive   = true
}

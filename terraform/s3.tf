# -----------------------------------------------------------------------------
# S3 Buckets — encrypted, with 24-hour lifecycle for cost guardrails
# -----------------------------------------------------------------------------

# Inventory bucket: CSV output from worker Lambdas
resource "aws_s3_bucket" "inventory" {
  bucket        = "${var.resource_prefix}-inventory"
  force_destroy = var.force_destroy_buckets
}

resource "aws_s3_bucket_server_side_encryption_configuration" "inventory_sse" {
  bucket = aws_s3_bucket.inventory.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "inventory_lifecycle" {
  bucket = aws_s3_bucket.inventory.id

  rule {
    id     = "expire-after-24h"
    status = "Enabled"

    expiration {
      days = var.inventory_lifecycle_days
    }
  }
}

resource "aws_s3_bucket_public_access_block" "inventory_pab" {
  bucket = aws_s3_bucket.inventory.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Athena results bucket
resource "aws_s3_bucket" "athena_results" {
  bucket        = "${var.resource_prefix}-athena-results"
  force_destroy = var.force_destroy_buckets
}

resource "aws_s3_bucket_server_side_encryption_configuration" "athena_results_sse" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "athena_results_lifecycle" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    id     = "expire-after-24h"
    status = "Enabled"

    expiration {
      days = var.athena_results_lifecycle_days
    }
  }
}

resource "aws_s3_bucket_public_access_block" "athena_results_pab" {
  bucket = aws_s3_bucket.athena_results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cache bucket: fast-load summary.json
resource "aws_s3_bucket" "cache" {
  bucket        = "${var.resource_prefix}-cache"
  force_destroy = var.force_destroy_buckets
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cache_sse" {
  bucket = aws_s3_bucket.cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cache_lifecycle" {
  bucket = aws_s3_bucket.cache.id

  rule {
    id     = "expire-after-24h"
    status = "Enabled"

    expiration {
      days = var.cache_lifecycle_days
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cache_pab" {
  bucket = aws_s3_bucket.cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Frontend Hosting — S3 + CloudFront (fully automated deploy)
# -----------------------------------------------------------------------------

# S3 bucket for React build output
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.resource_prefix}-frontend"
  force_destroy = var.force_destroy_buckets
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend_sse" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "frontend_pab" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# CloudFront Origin Access Control — secure S3 access
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.resource_prefix}-frontend-oac"
  description                       = "OAC for frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "athena_proxy" {
  name                              = "${var.resource_prefix}-api-oac"
  description                       = "OAC for Lambda Function URL"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 bucket policy — allow CloudFront OAC to read objects
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# CloudFront Distribution — CDN with HTTPS and SPA routing
# -----------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.resource_prefix} dashboard"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    domain_name              = split("/", aws_lambda_function_url.athena_proxy.function_url)[2]
    origin_id                = "Lambda-${aws_lambda_function.athena_proxy.function_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.athena_proxy.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "Lambda-${aws_lambda_function.athena_proxy.function_name}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["content-type", "x-api-key", "x-auth-token"]

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
    compress    = true
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
    compress    = true
  }

  # SPA routing: serve index.html for all paths (React Router)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  wait_for_deployment = true
}

# -----------------------------------------------------------------------------
# Automated Frontend Build & Deploy
# -----------------------------------------------------------------------------

resource "null_resource" "frontend_deploy" {
  # Re-deploy when any frontend source file changes
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../frontend"
    environment = {
      REACT_APP_API_ENDPOINT   = "https://${aws_cloudfront_distribution.frontend.domain_name}/api"
      REACT_APP_AWS_REGION     = var.aws_region
      REACT_APP_OKTA_DOMAIN              = var.okta_domain
      REACT_APP_OKTA_CLIENT_ID           = var.okta_client_id
      REACT_APP_LOCAL_ADMIN_USERNAME     = var.local_admin_username
      REACT_APP_LOCAL_ADMIN_PASSWORD     = var.local_admin_password
    }
    command = <<-EOT
      npm ci --prefer-offline --no-audit
      npm run build
      aws s3 sync build/ s3://${aws_s3_bucket.frontend.id} --delete
      aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.frontend.id} --paths "/*"
    EOT
  }

  depends_on = [
    aws_s3_bucket.frontend,
    aws_cloudfront_distribution.frontend,
    aws_lambda_function_url.athena_proxy
  ]
}

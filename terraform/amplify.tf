# -----------------------------------------------------------------------------
# Amplify — React Frontend Hosting with GitHub Integration
# -----------------------------------------------------------------------------

resource "aws_amplify_app" "frontend" {
  name       = "${var.resource_prefix}-dashboard"
  repository = var.github_repository != "" ? var.github_repository : null

  # Only set Access Token if provided (required for GitHub PATs)
  access_token = var.github_oauth_token != "" ? var.github_oauth_token : null

  # Build specification
  build_spec = <<-YAML
    version: 1
    applications:
      - appRoot: frontend
        frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: build
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
  YAML

  environment_variables = {
    REACT_APP_API_ENDPOINT   = aws_lambda_function_url.athena_proxy.function_url
    REACT_APP_OKTA_DOMAIN    = var.okta_domain
    REACT_APP_OKTA_CLIENT_ID = var.okta_client_id
    REACT_APP_AWS_REGION     = var.aws_region
  }

  # Auto branch creation for main
  auto_branch_creation_config {
    enable_auto_build = true
    stage             = "PRODUCTION"

    framework             = "React"
    enable_pull_request_preview = false

    environment_variables = {
      REACT_APP_API_ENDPOINT = aws_lambda_function_url.athena_proxy.function_url
    }
  }

  auto_branch_creation_patterns = [
    "main",
    "master"
  ]

  enable_auto_branch_creation = true

  # SPA rewrites
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }
}

# Branch for main
resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
  stage       = "PRODUCTION"

  environment_variables = {
    REACT_APP_API_ENDPOINT = aws_lambda_function_url.athena_proxy.function_url
  }
}

# AWS IAM Identity Center Governance Dashboard

An open-source, serverless governance dashboard that audits AWS IAM Identity Center (SSO) permission assignments across your entire AWS Organization.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Amplify    │────▶│  Athena Proxy    │────▶│     Athena      │
│  (React UI) │     │    (Lambda)      │     │   (SQL Query)   │
│  SSO Auth   │     │  + Fast Cache    │     │                 │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  EventBridge│────▶│  Step Functions  │────▶│   S3 Inventory  │
│  (Schedule) │     │ Distributed Map  │     │   (CSV files)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ┌──────────┐ ┌──────────┐
              │  Worker  │ │  Worker  │  ... per account
              │ (Lambda) │ │ (Lambda) │
              └──────────┘ └──────────┘
```

## Features

- **Full Org Crawl**: Discovers all accounts in your AWS Organization and audits IAM Identity Center assignments
- **Distributed Processing**: Step Functions with Distributed Map for parallel per-account scanning
- **User & Group Resolution**: Resolves user/group GUIDs to friendly names and emails, expands group memberships
- **Fast-Load Cache**: Athena Proxy checks for pre-rendered `summary.json` before running SQL
- **SSO-Secured Frontend**: React dashboard protected by Identity Center OIDC authentication
- **Cost-Optimized**: 24-hour S3 lifecycle policies, no Glue Crawlers, fully serverless
- **Security Hardened**: S3 encryption at rest, configurable CORS, input validation, concurrency guardrails

## Prerequisites

- AWS Account with IAM Identity Center enabled
- Terraform >= 1.5
- Node.js >= 18
- Python 3.12
- AWS CLI configured with appropriate permissions

### Required IAM Permissions for Deployment

The IAM principal running `terraform apply` needs permissions for:

- S3 (create/manage buckets)
- Lambda (create/manage functions)
- IAM (create roles and policies)
- Step Functions (create state machines)
- Athena & Glue (create workgroups, databases, tables)
- Amplify (create apps)
- CloudWatch Logs (create log groups)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/alfredkzr/aws-iam-identity-center-governance-dashboard.git
cd aws-iam-identity-center-governance-dashboard
```

### 2. Configure Variables

```bash
cp terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars` with your values. At minimum, set:

| Variable | Description | Example |
|----------|-------------|---------|
| `resource_prefix` | Unique prefix for all resources | `myorg-idc-gov` |
| `sso_instance_arn` | ARN of your IAM Identity Center instance | `arn:aws:sso:::instance/ssoins-xxxxxxxx` |
| `identity_store_id` | Identity Store ID | `d-xxxxxxxxxx` |

### 3. Deploy Infrastructure

```bash
cd terraform
terraform init
terraform plan    # Review the changes
terraform apply
cd ..
```

Terraform will output the `athena_proxy_url` and `amplify_default_domain` — you'll need these for the next steps.

### 4. Deploy Frontend

**Option A: GitHub Auto-Deploy (Recommended)**

If you set `github_repository` and `github_oauth_token` in your tfvars, Amplify will automatically build and deploy on every push to `main`. See [GitHub Token Setup](#github-token-setup) below.

#### Option B: Manual Deploy

If you didn't connect GitHub, deploy manually via the Amplify console:

```bash
cd frontend
npm install

# Set environment variables (get from Terraform outputs)
export REACT_APP_API_ENDPOINT=$(terraform -chdir=../terraform output -raw athena_proxy_url)
export REACT_APP_AWS_REGION=$(terraform -chdir=../terraform output -raw aws_region)

# Build and package
npm run build
cd build
zip -r ../deploy.zip .
cd ..

# Then upload the deploy.zip file via the Amplify Console:
# 1. Select your app -> "Deployments"
# 2. Choose "Deploy without a Git provider"
# 3. Drag and drop deploy.zip
```

### 5. Run the Initial Crawl

After deployment, trigger the Step Functions state machine to perform the first crawl:

```bash
aws stepfunctions start-execution \
  --region $(terraform -chdir=../terraform output -raw aws_region) \
  --state-machine-arn $(terraform -chdir=../terraform output -raw step_functions_arn)
```

The dashboard will populate with data once the crawl completes (typically 1–3 minutes).

## Okta SSO Setup

The dashboard supports Okta OIDC single sign-on. When Okta is not configured, it falls back to local username/password authentication.

### 1. Create an Okta Application

1. Log into your [Okta Admin Console](https://your-org-admin.okta.com/admin/apps/active)
2. Go to **Applications** → **Create App Integration**
3. Select:
   - **Sign-in method**: OIDC – OpenID Connect
   - **Application type**: Single-Page Application (SPA)
4. Click **Next**

### 2. Configure the Application

| Setting | Value |
|---------|-------|
| **App integration name** | `IAM Governance Dashboard` (or any name) |
| **Grant type** | ✅ Authorization Code |
| **Sign-in redirect URIs** | `http://localhost:3000/callback` (dev) |
| | `https://your-amplify-domain.amplifyapp.com/callback` (prod) |
| **Sign-out redirect URIs** | `http://localhost:3000` (dev) |
| | `https://your-amplify-domain.amplifyapp.com` (prod) |
| **Controlled access** | Choose who can access (e.g., "Allow everyone in your organization") |

5. Click **Save**
6. On the app's **General** tab, copy the **Client ID**

### 3. Set Environment Variables

Create a `.env` file in the `frontend/` directory:

```bash
# frontend/.env
REACT_APP_OKTA_DOMAIN=your-org.okta.com
REACT_APP_OKTA_CLIENT_ID=0oaXXXXXXXXXXXXXXXXX
REACT_APP_OKTA_REDIRECT_URI=http://localhost:3000/callback
```

> **Note:** Your Okta domain is the non-admin URL (e.g., `your-org.okta.com`, not `your-org-admin.okta.com`). You can find it under **Settings** → **Account** in the Okta Admin Console.

### 4. Restart the Dev Server

```bash
cd frontend
npm start
```

The login page will automatically show a **"Sign in with Okta"** button instead of the local username/password form.

### Production Deployment

For Amplify-hosted deployments, set the Okta variables in your `terraform.tfvars` — Terraform will pass them to Amplify as environment variables automatically:

```hcl
# In terraform/terraform.tfvars
okta_domain    = "your-org.okta.com"
okta_client_id = "0oaXXXXXXXXXXXXXXXXX"
```

The redirect URI is **auto-derived** from the Amplify domain (`https://main.<amplify-domain>/callback`), so you don't need to set it.

After deploying, add the production callback URL (`https://main.<your-amplify-domain>.amplifyapp.com/callback`) to your Okta app's **Sign-in redirect URIs**.

## GitHub Token Setup

If you want Amplify to auto-deploy from GitHub, you need a **GitHub Personal Access Token (classic)**:

1. Go to [GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Set a descriptive **Note** (e.g., `amplify-idc-dashboard`)
4. Set **Expiration** as needed
5. Select these scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `admin:repo_hook` (manage webhooks — needed for auto-deploy triggers)
6. Click **Generate token** and copy the value immediately (you won't see it again)
7. Add it to your tfvars:

```hcl
# In terraform/terraform.tfvars
github_repository  = "https://github.com/your-org/aws-iam-identity-center-governance-dashboard"
github_oauth_token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Note:** With this setup, Terraform handles the full Amplify ↔ GitHub connection. You do **not** need to manually connect GitHub in the Amplify Console — Terraform does it for you via the OAuth token.

## Configuration Reference

### Required Variables

| Variable | Type | Description |
|----------|------|-------------|
| `resource_prefix` | `string` | Prefix for all resource names (must be globally unique for S3) |
| `sso_instance_arn` | `string` | ARN of your IAM Identity Center instance |
| `identity_store_id` | `string` | Identity Store ID |

### Security Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `allowed_origins` | `list(string)` | `["*"]` | CORS origins for the API. Leave as default for initial deploy, update with Amplify domain for production. |
| `lambda_url_auth_type` | `string` | `"NONE"` | `NONE` for demo, `AWS_IAM` for production |
| `force_destroy_buckets` | `bool` | `false` | Allow `terraform destroy` to delete non-empty buckets |

### Cost & Performance Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `log_retention_days` | `number` | `7` | CloudWatch Logs retention period |
| `worker_reserved_concurrency` | `number` | `10` | Max concurrent worker Lambda executions |
| `athena_proxy_reserved_concurrency` | `number` | `5` | Max concurrent proxy Lambda executions |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `aws_region` | `string` | `ap-southeast-1` | AWS deployment region |
| `project_name` | `string` | `idc-governance` | Tag value for resource identification |
| `environment` | `string` | `production` | Tag value for environment |
| `github_repository` | `string` | `""` | GitHub repo URL for Amplify auto-deploy |
| `github_oauth_token` | `string` | `""` | GitHub PAT for Amplify ([setup guide](#github-token-setup)) |
| `okta_domain` | `string` | `""` | Okta domain for SSO (e.g., `your-org.okta.com`) |
| `okta_client_id` | `string` | `""` | Okta OIDC application client ID |

## Project Structure

```
├── terraform/          # All infrastructure as code
│   ├── main.tf         # Provider configuration
│   ├── variables.tf    # All configurable variables
│   ├── s3.tf           # S3 buckets (encrypted, lifecycle policies)
│   ├── lambda.tf       # Lambda functions (worker + athena proxy)
│   ├── iam.tf          # IAM roles and policies (least privilege)
│   ├── athena.tf       # Athena workgroup, Glue catalog
│   ├── stepfunctions.tf# Step Functions state machine
│   ├── amplify.tf      # Amplify frontend hosting
│   └── outputs.tf      # Terraform outputs
├── backend/
│   ├── worker/         # Account assignment crawler Lambda
│   └── athena_proxy/   # Query lifecycle + cache Lambda
├── frontend/           # React dashboard with Amplify Auth
└── terraform.tfvars.example  # Template for your configuration
```

## Security Considerations

### Data at Rest
- All S3 buckets use **AES-256 server-side encryption** (SSE-S3)
- Data auto-expires after **24 hours** via lifecycle policies
- All buckets block public access

### Network / API Security
- Lambda Function URL defaults to `authorization_type = "NONE"` for quick demo setup
- **For production**: Set `lambda_url_auth_type = "AWS_IAM"` and configure SigV4 signed requests from the frontend
- **For production**: After initial deployment, set `allowed_origins` to your generated Amplify domain and re-apply to restrict CORS

### Input Validation
- Athena table name validated against `^[a-zA-Z_][a-zA-Z0-9_]*$` regex at Lambda cold-start
- Query type parameter validated against an allowlist (`all`, `summary`)
- Error responses do not leak internal exception details

### IAM Least Privilege
- Worker Lambda: read-only access to SSO, Identity Store, and Organizations; write-only to inventory S3 bucket
- Athena Proxy Lambda: Athena query execution; read/write to S3 buckets; read-only Glue catalog
- Step Functions: invoke worker Lambda only

### Cost Safety
- Lambda concurrency is capped (`worker_reserved_concurrency`, `athena_proxy_reserved_concurrency`)
- `force_destroy_buckets` defaults to `false` to prevent accidental data deletion

## Cost Estimate

This is a fully serverless architecture — you only pay when things run.

| Scale | Accounts | Monthly Est. |
|-------|----------|-------------|
| Small | 20 | **~$0.10** (likely $0.00 with Free Tier) |
| Medium | 100 | **~$0.50 – $1.00** |
| Large | 500 | **~$3.00 – $5.00** |

Key cost drivers: Lambda compute, Athena data scanned, Step Functions state transitions. All are negligible at typical governance dashboard scale.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Frontend development
cd frontend
npm install
npm start              # Starts React dev server on port 3000
# Default local login: admin / admin123
# (When Okta SSO env vars are not configured, local auth is used)

# Backend (Python Lambdas)
cd backend/worker
python3 -c "import handler"   # Verify imports
```

## License

MIT

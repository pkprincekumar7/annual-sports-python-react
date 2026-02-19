# Multi-Region (Per-Region API Domains)

This guide sets up **three independent regional backends** and a **single frontend**
that targets a **region-specific API domain**. There is **no global API domain**.

## When to use this
- You want fully independent regional stacks.
- You are okay with the frontend calling a **specific region** (by config).
- You do **not** need a single global API domain.

## Prerequisites
- Terraform 1.13+
- AWS CLI configured
- Route 53 hosted zone for your domains
- ACM certificates in `us-east-1` for CloudFront
- Existing global app bucket (`app_s3_bucket_name`)

## Global prerequisites (one-time)
1) **Create the global app bucket**
   - Enable versioning and default encryption (SSE-S3 or SSE-KMS).
   - Block public access.
2) **Create per-region log buckets**
   - `alb_access_logs_bucket_name` per region.
   - `cloudfront_logs_bucket_name` per region.
3) **Create IAM OIDC role** for GitHub Actions (per environment).
4) **Set GitHub Environment secrets** (per env):
   - `STATE_BUCKET`, `STATE_DDB_TABLE`, `APP_PREFIX`, `ROLE_ARN`
   - `TFVARS_ECS_BACKEND_US_EAST_1`, `TFVARS_ECS_BACKEND_EU_WEST_1`, `TFVARS_ECS_BACKEND_AP_SOUTHEAST_1`
   - `TFVARS_FRONTEND`
   - `TFVARS_APP_BUCKET`
5) **Workflow notes**
   - Terraform state region is fixed to `us-east-1` in workflows.
   - `ROLE_ARN` is read from GitHub Environment secrets (no workflow input).

## Regional backend (repeat per region)
For each region: `us-east-1`, `eu-west-1`, `ap-southeast-1`

1) **Set unique regional API domains**
   - `sports-dev-api-us.learning-dev.com`
   - `sports-dev-api-eu.learning-dev.com`
   - `sports-dev-api-ap.learning-dev.com`

2) **Enable regional CloudFront and initialize regional tfvars**
   - Start from `infra/aws/ecs-backend/tfvars/<env>.tfvars.example` and set all required keys.
   - Recommended baseline (adjust values per env and region):
```hcl
# Core
aws_region     = "us-east-1"
aws_account_id = "123456789012"
env            = "dev"
app_prefix     = "as"

# Networking
vpc_cidr           = "10.10.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
public_subnets     = ["10.10.1.0/24", "10.10.2.0/24"]
private_subnets    = ["10.10.11.0/24", "10.10.12.0/24"]

# Domains & certificates (per-region mode)
cloudfront_enabled            = true
api_domain                    = "sports-dev-api-us.learning-dev.com"
route53_zone_id               = "Z1234567890"
acm_certificate_arn           = "arn:aws:acm:us-east-1:123456789012:certificate/<alb-cert>"
cloudfront_acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/<cloudfront-cert>"

# Logging buckets
alb_access_logs_bucket_name = "your-alb-logs-bucket"
cloudfront_logs_bucket_name = "your-backend-cloudfront-logs-bucket"

# Global app bucket
app_s3_bucket_name = "your-app-bucket"

# CORS
apigw_cors_allowed_origins = ["https://sports-dev.your-domain.com"]

# Email + secrets bootstrap (example)
email_provider              = "gmail"
gmail_user                  = "your-email@your-domain.com"
email_from                  = "no-reply@your-domain.com"

# Secrets bootstrap (sample value; only used if Redis secret is empty)
redis_auth_token_bootstrap  = "replace-with-sample-redis-token"

# Services map is required (use the full map from tfvars example)
services = { ... }
```
   - Keep the `services` map complete (all services) exactly like the example file.

3) **Apply**
   - Run `ecs-backend-terraform.yml` with `action=apply` for the region.
4) **Deploy backend services**
   - Run `ecs-backend-deploy.yml` per service for each region.
5) **Capture outputs for next stack**
   - `task_role_arns` (used by `app-bucket` policy)

## App bucket policy (global)
1) Apply `app-bucket-terraform.yml` with:
   - `bucket_name = app_s3_bucket_name`
   - `task_role_arns` from each regional `ecs-backend` output
2) **Confirm access**
   - Ensure ECS tasks can read/write objects via pre-signed URLs.

## Secrets replication (global)
Run `replicate-secrets.yml` after any Secrets Manager changes in the source
region to keep all regional secrets in sync.

### Redis auth token updates
- `redis_auth_token_bootstrap` is only a bootstrap value for initializing empty secrets.
- `redis_endpoint_override` is not used in this per-region mode (leave it unset).
- If Redis token changes later:
  1) Update Secrets Manager in source region and replicate (`replicate-secrets.yml`)
  2) Re-apply each regional `ecs-backend` stack (if regional Redis is used)
  3) Re-deploy/restart ECS services in each region so tasks pick up the new secret value

## Frontend (single region)
1) Set frontend tfvars:
   - `aws_region = "us-east-1"`
   - `bucket_name` = S3 bucket for frontend assets
   - `domain = "sports-dev.learning-dev.com"`
   - `route53_zone_id` = hosted zone (required if `domain` is set)
   - `cloudfront_acm_certificate_arn` = us-east-1 certificate ARN
2) Apply `frontend-terraform.yml`.
3) **Deploy frontend**
   - Run `frontend-deploy.yml`.

## How frontend selects API
- Use `VITE_API_URL` to point to the desired regional API domain.
- Example: `https://sports-dev-api-us.learning-dev.com`

## Destroy order
1) Frontend (if desired)
2) `app-bucket` policy
3) Backends (per region)

## Best practice notes
- Keep log buckets **unique per region**.
- Keep `app_s3_bucket_name` **global/shared**.
- Keep CloudFront and API Gateway in each region.

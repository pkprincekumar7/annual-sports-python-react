# Multi-Region (Single Global API Domain)

This guide sets up **three regional backends** behind **one global API domain**
using a **single CloudFront distribution** with multi-origin routing.

## When to use this
- You want one API domain for all regions.
- You want active/active routing at the edge.

## Prerequisites
- Terraform 1.13+
- AWS CLI configured
- Route 53 hosted zone for your domains
- ACM certificate in `us-east-1` for the API domain
- Existing global app bucket (`app_s3_bucket_name`)

## Global prerequisites (one-time)
1) **Create the global app bucket**
   - Enable versioning and default encryption (SSE-S3 or SSE-KMS).
   - Block public access.
2) **Create a CloudFront logs bucket** (global)
3) **Create IAM OIDC role** for GitHub Actions (per environment).
4) **Set GitHub Environment secrets** (per env):
   - `STATE_BUCKET`, `STATE_DDB_TABLE`, `APP_PREFIX`, `ROLE_ARN`
   - `TFVARS_ECS_BACKEND_US_EAST_1`, `TFVARS_ECS_BACKEND_EU_WEST_1`, `TFVARS_ECS_BACKEND_AP_SOUTHEAST_1`
   - `TFVARS_FRONTEND`
   - `TFVARS_API_EDGE`
   - `TFVARS_REDIS_GLOBAL`
   - `TFVARS_APP_BUCKET`
5) **Workflow notes**
   - Terraform state region is fixed to `us-east-1` in workflows.
   - `ROLE_ARN` is read from GitHub Environment secrets (no workflow input).

## Step 1: Regional backend (repeat per region)
For each region: `us-east-1`, `eu-west-1`, `ap-southeast-1`

1) **Set unique regional API domains (optional)**
   - Optional when using global edge; can be empty or region-specific
   - Examples: `sports-dev-api-us.learning-dev.com`, `sports-dev-api-eu.learning-dev.com`
2) **Disable regional CloudFront and initialize regional tfvars**
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

# Domains & certificates (global-edge mode)
cloudfront_enabled  = false
api_domain          = "sports-dev-api-us.learning-dev.com" # optional; not used by global edge stack
acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/<alb-cert>"

# Logging buckets
alb_access_logs_bucket_name = "your-alb-logs-bucket"

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
   - Run `ecs-backend-terraform.yml` with `action=apply`.
4) **Collect outputs**
   - `vpc_id`, `private_subnet_ids`, `ecs_tasks_security_group_id`
   - `api_gateway_endpoint` (for `api-edge` origin_domains)
   - `task_role_arns` (for `app-bucket` policy)

## Step 2: Global Redis
1) **Prepare tfvars for `redis-global`**
   - `primary_region = "us-east-1"`
   - `app_prefix`, `env`
   - `primary_vpc_id`, `primary_subnet_ids`, `primary_ecs_sg_id`
   - `enable_eu_west_1 = true` with `eu_west_1_vpc_id`, `eu_west_1_subnet_ids`, `eu_west_1_ecs_sg_id`
   - `enable_ap_southeast_1 = true` with `ap_southeast_1_vpc_id`, `ap_southeast_1_subnet_ids`, `ap_southeast_1_ecs_sg_id`
   - `redis_auth_token` (must match the value used by ECS tasks)
2) **Apply `redis-global-terraform.yml`**
3) **Record the regional endpoints**
   - Outputs: `primary_endpoint`, `eu_west_1_endpoint`, `ap_southeast_1_endpoint`
4) **Use matching regional endpoint in each backend**
   - `us-east-1` backend → `redis_endpoint_override = primary_endpoint`
   - `eu-west-1` backend → `redis_endpoint_override = eu_west_1_endpoint`
   - `ap-southeast-1` backend → `redis_endpoint_override = ap_southeast_1_endpoint`

## Step 3: Re-apply regional backends (repeat per region)
1) **Point Redis to global datastore**
   - `redis_endpoint_override = <regional-redis-endpoint>`
2) **Apply**
   - Run `ecs-backend-terraform.yml` with `action=apply`.
   - This re-apply removes the temporary regional Redis and switches services to the global datastore.
3) **Deploy backend services**
   - Run `ecs-backend-deploy.yml` per service for each region.

## Step 4: Global API Edge
1) Apply `api-edge-terraform.yml` in `us-east-1`
2) Provide:
   - `origin_domains` map with API Gateway endpoints from each region
   - `default_origin_id`
   - `origin_routing_header` + `origin_routing_map` (header value → origin ID)
   - `geo_routing_enabled = true` + `geo_routing_map` (country code → origin ID)
   - `api_domain` (e.g., `sports-dev-api.learning-dev.com`)
   - `route53_zone_id` (required if `api_domain` is set)
   - `cloudfront_acm_certificate_arn` (us-east-1, required if `api_domain` is set)
   - `cloudfront_logs_bucket_name` (required if logging enabled)
3) Route 53 will point the API domain to the global CloudFront distribution.

## Step 5: App bucket policy (global)
1) Apply `app-bucket-terraform.yml` with:
   - `bucket_name = app_s3_bucket_name`
   - `task_role_arns` from each regional `ecs-backend` output
2) **Confirm access**
   - Ensure ECS tasks can read/write objects via pre-signed URLs.

## Step 5a: Secrets replication (global)
Run `replicate-secrets.yml` after any Secrets Manager changes in the source
region to keep all regional secrets in sync.

### Redis auth token rotation
- Keep one shared Redis token value across:
  - `redis-global` variable `redis_auth_token`
  - Secrets Manager `redis_auth_token` secret in each region
- If token value changes:
  1) Update Secrets Manager in source region and replicate (`replicate-secrets.yml`)
  2) Re-apply `redis-global-terraform.yml` with new `redis_auth_token`
  3) Re-deploy/restart ECS services in each region so tasks pick up the new secret value

## Step 6: Frontend (single region)
1) Set frontend tfvars:
   - `aws_region = "us-east-1"`
   - `bucket_name` = S3 bucket for frontend assets
   - `domain` (e.g., `sports-dev.learning-dev.com`)
   - `route53_zone_id` = hosted zone (required if `domain` is set)
   - `cloudfront_acm_certificate_arn` = us-east-1 certificate ARN
2) Apply `frontend-terraform.yml`.
3) **Deploy frontend**
   - Run `frontend-deploy.yml`.
4) Set `VITE_API_URL = https://sports-dev-api.learning-dev.com`

## Destroy order
1) Frontend (optional)
2) `api-edge`
3) `app-bucket` policy
4) `redis-global`
5) Regional `ecs-backend`

## Best practice notes
- Keep **log buckets** separate from the global app bucket.
- Keep **CloudFront + WAF** in `us-east-1`.
- Prefer **geo routing** with a default fallback; keep header routing for testing.

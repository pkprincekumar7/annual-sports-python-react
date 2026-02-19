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

2) **Enable regional CloudFront and ensure regional tfvars include**
   - `cloudfront_enabled = true`
   - `aws_region` = region
   - `aws_account_id`
   - `api_domain` = regional API domain
   - `route53_zone_id` = hosted zone
   - `acm_certificate_arn` = regional ACM cert for ALB HTTPS
   - `cloudfront_acm_certificate_arn` = us-east-1 certificate ARN (required if `api_domain` is set)
   - `cloudfront_logs_bucket_name` = region-specific bucket (required if logging enabled)
   - `alb_access_logs_bucket_name` = region-specific bucket
   - `app_s3_bucket_name` = global bucket
   - `vpc_cidr`, `availability_zones`, `public_subnets`, `private_subnets`
   - `apigw_cors_allowed_origins` includes frontend domain
   - Email settings and secrets bootstrap as needed:
     `email_provider`, `gmail_user`/`sendgrid_user`/`smtp_*`, `email_from`,
     `redis_auth_token_bootstrap`
   - `services` map

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

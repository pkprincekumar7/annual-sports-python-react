# Terragrunt Setup (Per-Region Mode)

This Terragrunt layout orchestrates the existing Terraform stacks for the
per-region API-domain architecture:

- `ecs-backend` in `us-east-1`, `eu-west-1`, `ap-southeast-1`
- `app-bucket` (global)
- `frontend` (single region)

## Layout

- `root.hcl` - remote state + provider generation
- `_shared/common.hcl` - mode-wide shared inputs (single source)
- `<env>/common.hcl` - thin adapter (`env` + derived values from `_shared/common.hcl`)
- `dev/ecs-backend/<region>/terragrunt.hcl` - regional backends
- `dev/app-bucket/terragrunt.hcl` - depends on all 3 backend outputs
- `dev/frontend/terragrunt.hcl` - frontend stack

Environment directories are available for: `dev`, `qa`, `stg`, `perf`, `prod`.

## Terragrunt dependency graph (output flow)

Terragrunt transfers values between stacks via remote state + `dependency` blocks.
Each arrow below means "downstream stack reads outputs from upstream stack state".

```text
ecs-backend/us-east-1  --(task_role_arns)--> app-bucket
ecs-backend/eu-west-1  --(task_role_arns)--> app-bucket
ecs-backend/ap-southeast-1 --(task_role_arns)--> app-bucket

frontend (independent from backend dependencies)
```

Notes:
- `app-bucket` depends on task roles from all three regional `ecs-backend` stacks.
- In per-region mode, `redis_endpoint_override` is not used.
- `frontend` does not consume backend stack outputs directly in Terragrunt.

## Prerequisites

### Before first run (required)

1) Initialize shared values in:

- `_shared/common.hcl` (primary place for real values)
- `<env>/common.hcl` (environment adapter, verify env-specific derived values)

Set/replace all placeholders for:

- account/domain basics (`aws_account_id`, `domain_root`, `route53_zone_id`, `app_prefix`)
- regional network map (CIDRs, AZs, public/private subnets)
- bucket names (app + ALB/CloudFront/frontend logs)
- ACM certificate ARNs (regional cert map + CloudFront cert ARN)
- email settings and Redis bootstrap value
- `services` map values

2) If using GitHub workflows, set environment secrets per env (`dev`, `qa`, `stg`, `perf`, `prod`):

- `ROLE_ARN`
- `STATE_BUCKET`
- `STATE_DDB_TABLE`
- `APP_PREFIX`

3) Ensure one-time AWS prerequisites exist:

- Terraform state bucket and DynamoDB lock table
- GitHub OIDC IAM role used by `ROLE_ARN`
- Route53 hosted zone
- Required ACM certificates
- Required buckets referenced in Terragrunt inputs

### Local shell environment variables

Set these environment variables before running Terragrunt locally:

- `TG_STATE_BUCKET`
- `TG_STATE_DDB_TABLE`
- `TG_APP_PREFIX` (for example `as`)

Example:

```bash
export TG_STATE_BUCKET="your-terraform-state-bucket"
export TG_STATE_DDB_TABLE="terraform-locks"
export TG_APP_PREFIX="as"
```

Note: Most placeholders are in `_shared/common.hcl`, not only `dev/common.hcl`.

## Usage

From:

```bash
cd infra/aws/terragrunt/per-region/dev
```

Plan everything:

```bash
terragrunt run-all plan
```

Apply everything (dependency-aware):

```bash
terragrunt run-all apply
```

If secrets were initialized/updated during apply, run `replicate-secrets.yml`
for the same environment before deploying services.

Apply only regional backends (parallel):

```bash
terragrunt run-all apply --terragrunt-include-dir "*/ecs-backend/*"
```

After backend apply, run `replicate-secrets.yml` for the same environment so
secrets are synchronized across regions.

Destroy order (recommended):

```bash
terragrunt run-all destroy --terragrunt-include-dir "*/frontend"
terragrunt run-all destroy --terragrunt-include-dir "*/app-bucket"
terragrunt run-all destroy --terragrunt-include-dir "*/ecs-backend/*"
```

# Terragrunt Setup (Global-Edge Mode)

This Terragrunt layout orchestrates a single global API domain with
regional backends, where each region uses its own regional Redis.

## Layout

- `root.hcl` - shared remote state/provider generation
- `_shared/common.hcl` - mode-wide shared inputs (single source)
- `<env>/common.hcl` - thin adapter (`env` + derived values from `_shared/common.hcl`)
- `dev/ecs-backend/<region>` - regional backends (includes regional Redis)
- `dev/api-edge` - depends on regional API Gateway outputs
- `dev/app-bucket` - depends on regional task role outputs
- `dev/frontend` - independent frontend stack

Environment directories are available for: `dev`, `qa`, `stg`, `perf`, `prod`.

## Terragrunt dependency graph (output flow)

Terragrunt transfers values between stacks via remote state + `dependency` blocks.
Each arrow below means "downstream stack reads outputs from upstream stack state".

```text
ecs-backend/us-east-1  --(api_gateway_endpoint)--> api-edge
ecs-backend/eu-west-1  --(api_gateway_endpoint)--> api-edge
ecs-backend/ap-southeast-1 --(api_gateway_endpoint)--> api-edge

ecs-backend/us-east-1  --(task_role_arns)--> app-bucket
ecs-backend/eu-west-1  --(task_role_arns)--> app-bucket
ecs-backend/ap-southeast-1 --(task_role_arns)--> app-bucket

frontend (independent from backend dependencies)
```

Notes:
- `api-edge` depends on all three regional `ecs-backend` stacks.
- `app-bucket` depends on task roles from all three regional `ecs-backend` stacks.
- `frontend` does not consume backend stack outputs directly in Terragrunt.

## Prerequisites

### Before first run (required)

1) Initialize shared values in:
- `_shared/common.hcl` (primary place for real values)
- `<env>/common.hcl` (environment adapter, verify env-specific derived values)

Set/replace placeholders for:
- account/domain basics (`aws_account_id`, `domain_root`, `route53_zone_id`, `app_prefix`)
- regional network map (CIDRs, AZs, public/private subnets)
- bucket names (app + ALB/CloudFront/frontend/api-edge logs)
- ACM certificate ARNs (regional cert map + CloudFront certs in `us-east-1`)
- email settings and Redis bootstrap value (`redis_auth_token_bootstrap`)
- `services` map values

2) If using GitHub workflows, set environment secrets per env:
- `ROLE_ARN`
- `STATE_BUCKET`
- `STATE_DDB_TABLE`
- `APP_PREFIX`

3) Ensure one-time AWS prerequisites exist:
- Terraform state bucket and DynamoDB lock table
- GitHub OIDC IAM role used by `ROLE_ARN`
- Route53 hosted zone
- Required ACM certificates (regional and CloudFront in `us-east-1`)
- Required buckets referenced in Terragrunt inputs

### Local shell environment variables

```bash
export TG_STATE_BUCKET="your-terraform-state-bucket"
export TG_STATE_DDB_TABLE="terraform-locks"
export TG_APP_PREFIX="as"
```

## Apply Commands (Recommended Order)

From:

```bash
cd infra/aws/terragrunt/global-edge/dev
```

1) Apply regional backends:

```bash
terragrunt run-all apply --terragrunt-include-dir "*/ecs-backend/*"
```

2) Replicate secrets:
- Run `replicate-secrets.yml` for the same environment.

3) Apply global stacks:

```bash
terragrunt run-all apply --terragrunt-include-dir "*/api-edge"
terragrunt run-all apply --terragrunt-include-dir "*/app-bucket"
terragrunt run-all apply --terragrunt-include-dir "*/frontend"
```

4) Create CloudFront invalidation `/*` (recommended after `api-edge` apply), especially when Lambda@Edge code or association changed.

Fallback for stale edge behavior:
- Make a no-op change in `infra/aws/api-edge/lambda/origin-router.js.tmpl` (for example, add a comment).
- Re-apply `api-edge`, then create invalidation `/*` again.

## Destroy Order

```bash
terragrunt run-all destroy --terragrunt-include-dir "*/frontend"
terragrunt run-all destroy --terragrunt-include-dir "*/api-edge"
terragrunt run-all destroy --terragrunt-include-dir "*/app-bucket"
terragrunt run-all destroy --terragrunt-include-dir "*/ecs-backend/*"
```

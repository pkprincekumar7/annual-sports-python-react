# Terragrunt Setup (Global-Edge Mode)

This Terragrunt layout orchestrates the existing Terraform stacks for the
single global API-domain architecture:

1. Initial regional `ecs-backend` apply (regional Redis, CloudFront disabled)
2. `redis-global` apply (consumes outputs from step 1)
3. Regional `ecs-backend` re-apply with `redis_endpoint_override`
4. `api-edge`, `app-bucket`, and `frontend`

## Layout

- `root.hcl` - shared remote state/provider generation
- `_shared/common.hcl` - mode-wide shared inputs (single source)
- `<env>/common.hcl` - thin adapter (`env` + derived values from `_shared/common.hcl`)
- `dev/ecs-backend-initial/<region>` - phase 1
- `dev/redis-global` - depends on phase 1 outputs
- `dev/ecs-backend-global/<region>` - phase 2 (uses redis global endpoints)
- `dev/api-edge` - depends on phase 2 API Gateway outputs
- `dev/app-bucket` - depends on phase 2 task role outputs
- `dev/frontend` - independent frontend stack

Environment directories are available for: `dev`, `qa`, `stg`, `perf`, `prod`.

## Terragrunt dependency graph (output flow)

Terragrunt transfers values between stacks via remote state + `dependency` blocks.
Each arrow below means "downstream stack reads outputs from upstream stack state".

```text
ecs-backend-initial/us-east-1  --(vpc_id, private_subnet_ids, ecs_tasks_security_group_id)--> redis-global
ecs-backend-initial/eu-west-1  --(vpc_id, private_subnet_ids, ecs_tasks_security_group_id)--> redis-global
ecs-backend-initial/ap-southeast-1 --(vpc_id, private_subnet_ids, ecs_tasks_security_group_id)--> redis-global

redis-global --(primary_endpoint / eu_west_1_endpoint / ap_southeast_1_endpoint)--> ecs-backend-global/{region}

ecs-backend-global/us-east-1  --(api_gateway_endpoint)--> api-edge
ecs-backend-global/eu-west-1  --(api_gateway_endpoint)--> api-edge
ecs-backend-global/ap-southeast-1 --(api_gateway_endpoint)--> api-edge

ecs-backend-global/us-east-1  --(task_role_arns)--> app-bucket
ecs-backend-global/eu-west-1  --(task_role_arns)--> app-bucket
ecs-backend-global/ap-southeast-1 --(task_role_arns)--> app-bucket

frontend (independent from backend dependencies)
```

Notes:
- `api-edge` depends on all three `ecs-backend-global` regional stacks.
- `app-bucket` depends on task roles from all three `ecs-backend-global` regional stacks.
- `frontend` does not consume backend stack outputs directly in Terragrunt.

## Prerequisites

### Before first run (required)

1) Initialize shared values in:

- `_shared/common.hcl` (primary place for real values)
- `<env>/common.hcl` (environment adapter, verify env-specific derived values)

Set/replace all placeholders for:

- account/domain basics (`aws_account_id`, `domain_root`, `route53_zone_id`, `app_prefix`)
- regional network map (CIDRs, AZs, public/private subnets)
- bucket names (app + ALB/CloudFront/frontend/api-edge logs)
- ACM certificate ARNs (regional cert map + CloudFront certs in `us-east-1`)
- email settings and Redis values (`redis_auth_token_bootstrap`, `redis_auth_token`, `redis_node_type`)
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
- Required ACM certificates (regional and CloudFront in `us-east-1`)
- Required buckets referenced in Terragrunt inputs

### Local shell environment variables

Set env vars before running Terragrunt locally:

- `TG_STATE_BUCKET`
- `TG_STATE_DDB_TABLE`
- `TG_APP_PREFIX`

Example:

```bash
export TG_STATE_BUCKET="your-terraform-state-bucket"
export TG_STATE_DDB_TABLE="terraform-locks"
export TG_APP_PREFIX="as"
```

Note: Most placeholders are in `_shared/common.hcl`, not only `dev/common.hcl`.

## Apply Commands (Recommended Order)

From:

```bash
cd infra/aws/terragrunt/global-edge/dev
```

Phase 1 (regional backends):

```bash
terragrunt run-all apply --terragrunt-include-dir "*/ecs-backend-initial/*"
```

After phase 1 apply, run `replicate-secrets.yml` for the same environment so
secrets are synchronized across regions.

Redis global:

```bash
terragrunt run-all apply --terragrunt-include-dir "*/redis-global"
```

Phase 2 (regional re-apply with global Redis endpoints):

```bash
terragrunt run-all apply --terragrunt-include-dir "*/ecs-backend-global/*"
```

After phase 2 re-apply, run `replicate-secrets.yml` again if any Secrets
Manager values changed (especially Redis token).

Global stacks:

```bash
terragrunt run-all apply --terragrunt-include-dir "*/api-edge"
terragrunt run-all apply --terragrunt-include-dir "*/app-bucket"
terragrunt run-all apply --terragrunt-include-dir "*/frontend"
```

## Destroy Order

```bash
terragrunt run-all destroy --terragrunt-include-dir "*/frontend"
terragrunt run-all destroy --terragrunt-include-dir "*/api-edge"
terragrunt run-all destroy --terragrunt-include-dir "*/app-bucket"
terragrunt run-all destroy --terragrunt-include-dir "*/ecs-backend-global/*"
terragrunt run-all destroy --terragrunt-include-dir "*/redis-global"
terragrunt run-all destroy --terragrunt-include-dir "*/ecs-backend-initial/*"
```

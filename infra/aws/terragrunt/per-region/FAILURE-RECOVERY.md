# Terragrunt Failure Recovery (Per-Region Mode)

This runbook explains what to do when any Terragrunt stage fails in
`infra/aws/terragrunt/per-region/<env>`.

## Core Rule

- Stop and fix the current failing stage first.
- Do not proceed to other stages until the failed stage is healthy.
- Re-run `plan` for the same scope before retrying `apply` or `destroy`.

## Before You Retry

1. Confirm GitHub environment secrets (if running via workflow):
   - `ROLE_ARN`
   - `STATE_BUCKET`
   - `STATE_DDB_TABLE`
   - `APP_PREFIX`
2. Confirm state backend settings are valid:
   - S3 state bucket exists and is accessible
   - DynamoDB lock table exists and is accessible
3. Confirm placeholders are replaced in:
   - `_shared/common.hcl` (primary values)
   - `<env>/common.hcl` (env-specific adapter values)

## Common Failure Sources

- Missing/incorrect secrets in GitHub Environment.
- Placeholder values still present in `_shared/common.hcl`.
- Route53 zone/domain mismatch.
- ACM certificate ARN mismatch or wrong region for CloudFront-related values.
- Invalid subnet/VPC CIDR map values for one or more regions.
- Missing dependency outputs when scoped runs skip required stacks.

## Stage-Specific Recovery

## `ecs-backend` failure

Check:
- `network` values for the failed region (`vpc_cidr`, subnet CIDRs, AZs).
- `acm_certificate_arn_by_region` contains the failed region.
- Domain and hosted zone settings are correct.
- Required bucket names and service map values are valid.

Recover:
- Fix config in `_shared/common.hcl` or `<env>/common.hcl`.
- Re-run only `ecs-backend` scope for impacted region(s).
- Re-run full `plan` for the environment after regional recovery.

## `app-bucket` failure

Check:
- Backend dependencies are applied and expose `task_role_arns`.
- Target app bucket exists and is correct.
- IAM permissions allow bucket policy updates.

Recover:
- If backend outputs are missing, re-run backend stage first.
- Retry `app-bucket` after dependencies are healthy.

## `frontend` failure

Check:
- Frontend domain, Route53 zone ID, and cert ARN values.
- Frontend/log bucket names.

Recover:
- Correct domain/cert/zone/bucket values.
- Re-run only frontend scope.

## Destroy Recovery (Per-Region)

Use this order only:
1. `frontend`
2. `app-bucket`
3. `ecs-backend`

If destroy fails:
- Fix the failed scope and retry that scope.
- Do not jump ahead in order.
- Re-run destroy for remaining scopes after failure is resolved.

## Safe Retry Strategy

- Prefer retrying the smallest failing scope first.
- If repeated failures occur, run a full environment `plan` and inspect drift.
- Never manually delete resources out-of-band unless absolutely necessary.
- If manual intervention is unavoidable, document it and re-run `plan` after.

## Quick Triage Checklist (First 5 Minutes)

- Are all GitHub environment secrets present and non-empty?
- Is `_shared/common.hcl` fully initialized (no sample placeholders)?
- Are Route53 zone and domain values aligned?
- Are cert ARNs valid for expected regions?
- Did a scoped run skip a required dependency stack?

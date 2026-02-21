# Terragrunt Failure Recovery (Global-Edge Mode)

This runbook explains what to do when any Terragrunt phase fails in
`infra/aws/terragrunt/global-edge/<env>`.

## Core Rule

- Stop at the failing phase and fix it first.
- Do not continue to the next phase until the current phase is healthy.
- Re-run `plan` for the same phase/scope before retrying `apply` or `destroy`.

## Before You Retry

1. Confirm GitHub environment secrets:
   - `ROLE_ARN`
   - `STATE_BUCKET`
   - `STATE_DDB_TABLE`
   - `APP_PREFIX`
2. Confirm state backend settings are valid:
   - S3 state bucket exists and is accessible
   - DynamoDB lock table exists and is accessible
3. Confirm placeholders are replaced in:
   - `_shared/common.hcl`
   - `<env>/common.hcl`

## Common Failure Sources

- Missing/incorrect secrets in GitHub Environment.
- Placeholder values still present in `_shared/common.hcl`.
- Route53 zone/domain mismatch.
- ACM certificate ARN mismatch (CloudFront cert must be in `us-east-1`).
- Invalid network CIDR/subnet map for one or more regions.
- Phase order violations (running dependent phases before prerequisites).

## Phase-Specific Recovery

## Phase 1: `ecs-backend/*` failure

Check:
- Regional network, cert, domain, log bucket, and service map values.

Recover:
- Fix inputs in `_shared/common.hcl` / `<env>/common.hcl`.
- Re-run only failed region(s) under `ecs-backend/*`.
- Confirm regional outputs exist before moving on.

## Phase 1.5: `replicate-secrets` checkpoint

When to run:
- After backend apply, and after any Secrets Manager value changes.

Check:
- `replicate-secrets.yml` completed successfully.
- Expected secret values are synchronized across regions.

Recover:
- Re-run `replicate-secrets.yml` for the environment.

## Phase 2: `api-edge` failure

Check:
- All regional `ecs-backend` API gateway endpoints exist.
- `api_domain`, `route53_zone_id`, and CloudFront cert ARN are valid.
- Routing maps (`geo_routing_map` and origin mapping) are consistent.

Recover:
- Correct routing/domain/cert values.
- Retry `api-edge`.
- Create CloudFront invalidation `/*` after successful apply.

## Phase 3: `app-bucket` failure

Check:
- `task_role_arns` are present from all regional backends.
- Target bucket exists and policy update permissions are valid.

Recover:
- Re-run missing regional backend if needed.
- Retry `app-bucket`.

## Phase 4: `frontend` failure

Check:
- Frontend domain, Route53 zone ID, cert ARN, and logs bucket.

Recover:
- Correct values and retry `frontend`.

## Destroy Recovery (Global-Edge)

Use this order only:
1. `frontend`
2. `api-edge`
3. `app-bucket`
4. `ecs-backend/*`

If destroy fails:
- Resolve failure in current step and retry that step.
- Do not skip ahead in destroy order.

## Quick Triage Checklist

- Are all GitHub environment secrets present and non-empty?
- Is `_shared/common.hcl` fully initialized?
- Are Route53 zone/domain values aligned?
- Are cert ARNs valid and in correct regions?
- Did phase ordering violate dependencies?

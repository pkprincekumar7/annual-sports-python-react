# Terragrunt Failure Recovery (Global-Edge Mode)

This runbook explains what to do when any Terragrunt phase fails in
`infra/aws/terragrunt/global-edge/<env>`.

## Core Rule

- Stop at the failing phase and fix it first.
- Do not continue to the next phase until the current phase is healthy.
- Re-run `plan` for the same phase/scope before retrying `apply` or `destroy`.

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
- ACM certificate ARN mismatch (CloudFront certs must be in `us-east-1`).
- Invalid subnet/VPC CIDR map values for one or more regions.
- Phase order violations (running dependent phases before prerequisites).

## Phase-Specific Recovery

## Phase 1: `ecs-backend-initial/*` failure

Check:
- Regional `network` map is valid for the failing region.
- Regional cert/domain/log bucket values are valid.
- Service map values are complete and consistent.

Recover:
- Fix inputs in `_shared/common.hcl` / `<env>/common.hcl`.
- Re-run only failed region(s) under `ecs-backend-initial/*`.
- Confirm outputs are produced before moving to `redis-global`.

## Phase 2: `redis-global` failure

Check:
- `ecs-backend-initial` outputs exist for all required regions:
  - `vpc_id`
  - `private_subnet_ids`
  - `ecs_tasks_security_group_id`
- Redis variables are valid:
  - `redis_auth_token`
  - `redis_node_type`
  - enabled region flags and matching subnet/SG IDs

Recover:
- Re-run failed `ecs-backend-initial` region(s) if outputs are missing.
- Retry `redis-global` only.

## Phase 2.5: `replicate-secrets` checkpoint (required before backend re-apply)

When to run:
- After any Secrets Manager value changes in source region (especially Redis token).
- Before retrying `ecs-backend-global/*` if tokens/secrets were updated.

Check:
- `replicate-secrets.yml` completed successfully for the target environment.
- Redis/auth-related secrets exist with consistent values across all target regions.

Recover:
- Re-run `replicate-secrets.yml` for the environment.
- Verify replication success, then continue to `ecs-backend-global/*`.

## Phase 3: `ecs-backend-global/*` failure

Check:
- `redis-global` completed and endpoint outputs are available.
- Required secrets are replicated across regions (`replicate-secrets.yml`).
- Backend stacks are using correct Redis endpoint overrides.
- Regional backend config values remain valid.

Recover:
- Fix redis endpoint or backend inputs.
- Re-run failed region(s) in `ecs-backend-global/*`.

## Phase 4: `api-edge` failure

Check:
- All regional `ecs-backend-global` API gateway endpoints exist.
- `api_domain`, `route53_zone_id`, and CloudFront cert ARN are valid.
- Routing maps (`geo_routing_map` and origin mapping) are consistent.

Recover:
- Correct routing/domain/cert values.
- Retry `api-edge` only.

## Phase 5: `app-bucket` failure

Check:
- `task_role_arns` are present from all regional backends.
- Target bucket exists and bucket policy update permissions are valid.

Recover:
- Re-run missing backend phase if needed.
- Retry `app-bucket` only.

## Phase 6: `frontend` failure

Check:
- Frontend domain, Route53 zone ID, cert ARN, and logs bucket.

Recover:
- Correct values and retry `frontend` only.

## Destroy Recovery (Global-Edge)

Use this order only:
1. `frontend`
2. `api-edge`
3. `app-bucket`
4. `ecs-backend-global/*`
5. `redis-global`
6. `ecs-backend-initial/*`

If destroy fails:
- Resolve failure in current step and retry it.
- Do not skip ahead in destroy order.
- Continue only after current step succeeds.

Note: Workflow guardrails enforce `destroy` only with `phase=all` to reduce
dependency-order teardown risks.

## Safe Retry Strategy

- Retry the smallest failing scope first.
- If repeated failures occur, run full environment `plan` and inspect drift.
- Avoid manual out-of-band deletion where possible.
- If manual intervention is necessary, document it and re-run `plan`.

## Quick Triage Checklist (First 5 Minutes)

- Are all GitHub environment secrets present and non-empty?
- Is `_shared/common.hcl` fully initialized (no sample placeholders)?
- Are Route53 zone and domain values aligned?
- Are cert ARNs valid and in correct regions?
- Did phase ordering violate dependencies?

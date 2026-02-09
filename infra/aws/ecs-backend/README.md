# AWS ECS Fargate with Terraform (Backend)

Terraform for ECS is already scaffolded here:

`infra/aws/ecs-backend`

## Prerequisites
- Terraform 1.13+
- AWS CLI configured (`aws configure`)

## Usage

Before you run Terraform, create the S3 bucket and DynamoDB table manually. The
environment backend files are committed so everyone shares the same bucket/table.
Update the `hcl/backend-*.hcl` files with your actual bucket and table names
before `terraform init`. For multi-region, use a region-specific state key.

Recommended bucket/table setup:
- S3 bucket: versioning enabled, default encryption enabled, public access blocked
- DynamoDB table: partition key `LockID` (string), on-demand billing

### 1) Configure Secrets Manager Names

Terraform creates the Secrets Manager resources. Secret names are derived from
`env` (for example, `as-dev-jwt`, `as-dev-mongo-uri`, etc.). Populate secret
values separately in AWS Secrets Manager.

### 2) Initialize Terraform

```bash
cd infra/aws/ecs-backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
```

Update `dev.tfvars`:
- Core: `aws_account_id`, `aws_region`, `env`
- Networking: `public_subnets`, `private_subnets`, `availability_zones`
- Domains & certs: `api_domain`, `route53_zone_id`, `acm_certificate_arn`,
  `cloudfront_acm_certificate_arn`
- Logging buckets: `alb_access_logs_bucket_name`, `cloudfront_logs_bucket_name`
- CORS: `apigw_cors_allowed_origins`
- Optional ALB settings: `alb_ssl_policy`, `alb_deletion_protection`,
  `alb_access_logs_enabled`, `alb_access_logs_prefix`
- Optional WAF: `waf_enabled` (applies to CloudFront)
- Optional CloudFront logs: `cloudfront_logging_enabled`
- Optional VPC flow logs: `flow_logs_enabled`, `flow_logs_retention_days`
- Optional Secrets KMS: `create_secrets_kms_key`, `secrets_kms_key_arn`
- Optional Secrets deletion: `secrets_recovery_window_in_days`
- `image_tag` (must match the tag you push)
- Optional app config: `jwt_expires_in`, `admin_reg_number`, `app_env`, `log_level`
- Optional autoscaling overrides: `autoscale_min`, `autoscale_max`, `autoscale_cpu_target`,
  `autoscale_memory_target`, `autoscale_alb_requests_target`,
  `autoscale_scale_in_cooldown`, `autoscale_scale_out_cooldown`
- Optional observability overrides: `log_retention_days`, `alarm_cpu_threshold`,
  `alarm_memory_threshold`, `alarm_alb_5xx_threshold`, `alarm_target_5xx_threshold`,
  `alarm_unhealthy_host_threshold`, `alarm_target_response_time_threshold`, `alarm_sns_topic_arn`
- Per-service sizing: `service_cpu_map`, `service_memory_map`, `ulimit_nofile_soft`, `ulimit_nofile_hard`
- Optional deployment behavior: `force_new_deployment`
- Optional email config: `email_provider`, `gmail_user`, `sendgrid_user`,
  `smtp_host`, `smtp_user`, `smtp_port`, `smtp_secure`, `email_from`, `email_from_name`
- Optional branding: `app_name`
- Optional Redis settings: `redis_node_type`, `redis_num_cache_nodes`,
  `redis_transit_encryption_enabled`, `redis_at_rest_encryption_enabled`,
  `redis_multi_az_enabled`, `redis_snapshot_retention_limit`,
  `redis_snapshot_window`

Database names are derived automatically using `env` (for example,
`as-dev-identity`, `as-dev-enrollment`, etc.).

### ALB Access Logs Bucket (Manual)

Terraform expects an existing S3 bucket for ALB access logs. Create the bucket
manually, then set `alb_access_logs_bucket_name` in `tfvars`. Terraform will
attach the bucket policy, ownership controls, public access block, and default
encryption. On `terraform destroy`, these policy/config resources are removed,
but the S3 bucket itself is not deleted.

### API Gateway + Private ALB (CORS)

This stack provisions an HTTP API Gateway with a VPC Link to a **private** ALB.
CloudFront sits in front of API Gateway for edge protection and WAF.

- CORS is enforced at API Gateway using `apigw_cors_allowed_origins`.
- The ALB ACM certificate must be in the same region as the ECS stack.
- If `api_domain` and `route53_zone_id` are set, Terraform creates an alias
  record pointing the API domain to **CloudFront**.
- If `api_domain` is empty, use the `cloudfront_domain` output for requests.
- API Gateway access logs are enabled and use the same retention as
  `log_retention_days`.
- ALB deletion protection is disabled by default to allow `terraform destroy`.
  If you enable it, set `alb_deletion_protection = false` before destroy.

CloudFront uses `cloudfront_acm_certificate_arn` (must be in `us-east-1`) when
`api_domain` is set.

If you enable CloudFront logs, use an existing bucket. Backend and frontend
should use separate buckets (no prefixes required). Terraform will attach the
CloudFront log delivery bucket policy and ACL/ownership controls to the logs
bucket, and remove them on destroy. The bucket itself is not deleted.

Secrets Manager uses a KMS key. Terraform grants the ECS task execution role
`kms:Decrypt` and `kms:GenerateDataKey` on the managed key. If you supply an
existing KMS key (`secrets_kms_key_arn`), ensure its key policy allows the task
execution role to decrypt.

### 3) Create ECR Repositories (Target Apply)

Terraform manages ECR, so create repos first:

```bash
terraform apply -target=aws_ecr_repository.repos -var-file=dev.tfvars
```

### 4) Build and Push Images (Backend Services)

Set variables:

```bash
AWS_ACCOUNT_ID=<your-account-id>
AWS_REGION=<your-region>
IMAGE_TAG=<your-image-tag>
NAME_PREFIX=as-dev
```

Print values (if you used the AWS CLI defaults):

```bash
echo "$AWS_ACCOUNT_ID"
echo "$AWS_REGION"
echo "$IMAGE_TAG"

# Or populate and print:
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
IMAGE_TAG=<your-image-tag>
NAME_PREFIX=<your-name-prefix>
echo "$AWS_ACCOUNT_ID"
echo "$AWS_REGION"
echo "$IMAGE_TAG"
echo "$NAME_PREFIX"
```

Login to ECR:

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Build and push:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  docker build -t "${NAME_PREFIX}-${service}:${IMAGE_TAG}" "$REPO_ROOT/$service"
  docker tag "${NAME_PREFIX}-${service}:${IMAGE_TAG}" \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
  docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
done
```

### 5) Create Secrets (Target Apply) and Populate Values

Create the Secrets Manager resources with Terraform.

```bash
terraform apply -target=aws_secretsmanager_secret.jwt_secret \
  -target=aws_secretsmanager_secret.mongo_uri \
  -target=aws_secretsmanager_secret.redis_auth_token \
  -target=aws_secretsmanager_secret.gmail_app_password \
  -target=aws_secretsmanager_secret.sendgrid_api_key \
  -target=aws_secretsmanager_secret.resend_api_key \
  -target=aws_secretsmanager_secret.smtp_password \
  -var-file=dev.tfvars
```

Add secret values in AWS Secrets Manager (Console or CLI) before applying the
full stack.

CLI examples (replace values):

```bash
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-jwt" --secret-string "replace-with-strong-secret"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-mongo-uri" --secret-string "mongodb+srv://user:pass@cluster"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-redis-auth-token" --secret-string "replace-with-strong-token"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-gmail-app-password" --secret-string "your-app-password"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-sendgrid-api-key" --secret-string "your-sendgrid-api-key"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-resend-api-key" --secret-string "your-resend-api-key"
aws secretsmanager put-secret-value --secret-id "${NAME_PREFIX}-smtp-password" --secret-string "your-smtp-password"
```

If a secret name was previously deleted and is now scheduled for deletion,
restore it before running the Terraform target apply:

```bash
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-jwt"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-mongo-uri"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-redis-auth-token"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-gmail-app-password"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-sendgrid-api-key"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-resend-api-key"
aws secretsmanager restore-secret --secret-id "${NAME_PREFIX}-smtp-password"
```

If the secrets already exist and you want Terraform to manage them, import them
into state before the full apply:

```bash
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-jwt" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.jwt_secret "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-mongo-uri" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.mongo_uri "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-redis-auth-token" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.redis_auth_token "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-gmail-app-password" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.gmail_app_password "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-sendgrid-api-key" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.sendgrid_api_key "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-resend-api-key" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.resend_api_key "$SECRET_ARN"

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "${NAME_PREFIX}-smtp-password" --query 'ARN' --output text)
terraform import -var-file=dev.tfvars aws_secretsmanager_secret.smtp_password "$SECRET_ARN"
```

### 6) Apply Full Stack

```bash
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Run in background (keeps running after disconnect, no prompt):

```bash
nohup terraform apply -var-file=dev.tfvars -auto-approve > terraform-apply.log 2>&1 &
disown
```

Tail logs:

```bash
tail -f terraform-apply.log
```

### 7) Verify

Get CloudFront domain:

```bash
terraform output -raw cloudfront_domain
```

Then test the API:

```bash
curl -I https://<cloudfront-domain>/identities/docs
```

If you provided `api_domain` and DNS, use HTTPS:

```bash
curl -I https://your-api-domain.com/identities/docs
```

Other useful outputs:

```bash
terraform output
```

See `outputs.tf` for available values (for example: `redis_endpoint`, `redis_url`,
`service_discovery_namespace`, `ecr_repository_urls`).

### 8) Connect to a Fargate Task (ECS Exec) + Run Curl

ECS Exec is already enabled in Terraform. If you just applied, wait for tasks
to restart (or force a new deployment) before connecting.

Set variables:

```bash
CLUSTER_NAME=<your-cluster-name>
SERVICE_NAME=<your-service-name>  # example: ${NAME_PREFIX}-identity-service
CONTAINER_NAME=<your-container-name> # example: identity-service
```

Get a running task ARN and open a shell:

```bash
TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster "$CLUSTER_NAME" --task "$TASK_ARN" --container "$CONTAINER_NAME" --interactive --command "/bin/sh"
```

Run curl from inside the container:

```bash
curl -I http://event-configuration-service.${SERVICE_NAMESPACE}:8005/health
```

If `curl` is not installed, install it based on your image base:

```bash
# Debian/Ubuntu-based images
apt-get update && apt-get install -y curl

# Alpine-based images
apk add --no-cache curl
```

## Updating Images

After pushing a new image to ECR, redeploy ECS services so tasks pull the new image.

If you use a **new tag** (recommended):
- Update `image_tag` in `dev.tfvars`
- Apply:

```bash
terraform apply -var-file=dev.tfvars
```

If you reuse the **same tag** (for example, `latest`), you may still need to
force a new deployment to refresh tasks:

```bash
CLUSTER_NAME=<your-cluster-name>
NAME_PREFIX=<your-name-prefix>
for svc in \
  ${NAME_PREFIX}-identity-service \
  ${NAME_PREFIX}-enrollment-service \
  ${NAME_PREFIX}-department-service \
  ${NAME_PREFIX}-sports-participation-service \
  ${NAME_PREFIX}-event-configuration-service \
  ${NAME_PREFIX}-scheduling-service \
  ${NAME_PREFIX}-scoring-service \
  ${NAME_PREFIX}-reporting-service; do
  aws ecs update-service --cluster "$CLUSTER_NAME" --service "$svc" --force-new-deployment
done
```

## Multiple Environments

Use the environment-specific backend files and tfvars templates:

Available environments:
- `dev` → `hcl/backend-dev.hcl`, `tfvars/dev.tfvars.example`
- `qa` → `hcl/backend-qa.hcl`, `tfvars/qa.tfvars.example`
- `stg` → `hcl/backend-stg.hcl`, `tfvars/stg.tfvars.example`
- `perf` → `hcl/backend-perf.hcl`, `tfvars/perf.tfvars.example`
- `prod` → `hcl/backend-prod.hcl`, `tfvars/prod.tfvars.example`

```bash
cd infra/aws/ecs-backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Repeat with `qa`, `stg`, `perf`, or `prod` by swapping the backend/tfvars files
(for example, `hcl/backend-qa.hcl` + `tfvars/qa.tfvars.example`).

## GitHub Actions (Terraform)

### GitHub Actions Setup Checklist

1) Repo → Settings → Environments → create `dev`, `qa`, `stg`, `perf`, `prod`.
2) For each environment, add secrets:
   - `STATE_BUCKET`
   - `STATE_DDB_TABLE`
   - `STATE_REGION` (optional; defaults to workflow `aws_region`)
   - `TFVARS_ECS_BACKEND` (full tfvars content)
3) Create the IAM OIDC role and note its ARN.
4) Actions → run:
   - **ECS Backend Terraform** (plan/apply/destroy)
   - **ECS Backend Deploy** (build/push/deploy)

This repo includes a manual workflow to run Terraform via GitHub Actions:
`.github/workflows/ecs-backend-terraform.yml`.

Workflow inputs:
- `action`: `plan`, `apply`, or `destroy`
- `env`: `dev`, `qa`, `stg`, `perf`, or `prod`
- `aws_region`: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- `role_arn`: IAM role to assume via OIDC

Required GitHub Environment secrets (per env):
- `STATE_BUCKET`
- `STATE_DDB_TABLE`
- `STATE_REGION` (optional; defaults to `aws_region`)
- `TFVARS_ECS_BACKEND` (full tfvars content)

Example inputs:
- `action`: `apply`
- `env`: `dev`
- `aws_region`: `us-east-1`
- `role_arn`: `arn:aws:iam::123456789012:role/github-terraform`

## GitHub Actions (Deploy)

This repo includes a manual workflow to build, push, and deploy ECS services:
`.github/workflows/ecs-backend-deploy.yml`.

Workflow inputs:
- `env`: `dev`, `qa`, `stg`, `perf`, or `prod`
- `aws_region`: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- `role_arn`: IAM role to assume via OIDC
- `services`: `all` or a single service name (dropdown)

Behavior:
- Builds and pushes images with a UTC timestamp tag (`YYYYMMDDHHMMSS`)
- Registers new task definition revisions
- Updates ECS services and waits for stability

## Notes
- Configure Secrets Manager secret names in your environment tfvars (for example, `dev.tfvars`).
- The MongoDB URI secret is shared; each service selects the DB via `DATABASE_NAME`.
- Set `route53_zone_id` in tfvars to have Terraform create the API Route 53 record (`api_domain`).
- Redis is provisioned via ElastiCache with auth + in‑transit encryption; services use a
  `rediss://` URL (password included) automatically via `REDIS_URL`.
- Cloud Map service discovery is enabled; it is derived from `env` (for example, `annual-sports.dev.local`).
- ECS tasks run in private subnets; only the ALB is public.

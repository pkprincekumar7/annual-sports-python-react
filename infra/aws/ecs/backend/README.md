# AWS ECS Fargate with Terraform (Backend)

Terraform for ECS is already scaffolded here:

`infra/aws/ecs/backend`

## Prerequisites
- Terraform 1.13+
- AWS CLI configured (`aws configure`)

## Usage

Before you run Terraform, create the S3 bucket and DynamoDB table manually. The
environment backend files are committed so everyone shares the same bucket/table.
Update the `hcl/backend-*.hcl` files with your actual bucket and table names
before `terraform init`.

Recommended bucket/table setup:
- S3 bucket: versioning enabled, default encryption enabled, public access blocked
- DynamoDB table: partition key `LockID` (string), on-demand billing

### 1) Configure Secrets Manager Names

Terraform creates the Secrets Manager resources. You only need to provide the
secret names in `tfvars`. Populate secret values separately in AWS Secrets Manager.

Required names:
- `jwt_secret_name`
- `mongo_uri_secret_name` (shared MongoDB URI; DB name comes from `DATABASE_NAME`)
- Identity-only email secret names:
  - `gmail_app_password_secret_name`
  - `sendgrid_api_key_secret_name`
  - `resend_api_key_secret_name`
  - `smtp_password_secret_name`

### 2) Initialize Terraform

```bash
cd infra/aws/ecs/backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
```

Update `dev.tfvars`:
- `aws_account_id`, `aws_region`
- `cluster_name`
- `name_prefix` (short prefix like `as-dev` for shared AWS resource names)
- `service_discovery_namespace` (private DNS, example: `as-dev.local`)
- `public_subnets`, `private_subnets`, `availability_zones`
- `api_domain` (optional, API domain)
- `route53_zone_id` (optional, to auto-create API DNS record)
- `acm_certificate_arn` (optional, enables HTTPS listener for API/ALB)
- `image_tag` (must match the tag you push)
- `database_names` (map; one DB per service)
- `jwt_secret_name`, `mongo_uri_secret_name`, and identity email secret names
- Optional app config: `jwt_expires_in`, `admin_reg_number`, `app_env`, `log_level`
- Optional email config: `email_provider`, `gmail_user`, `sendgrid_user`,
  `smtp_host`, `smtp_user`, `smtp_port`, `smtp_secure`, `email_from`, `email_from_name`
- Optional branding: `app_name`

Example `database_names` map:

```hcl
database_names = {
  "identity-service"             = "as-dev-identity"
  "enrollment-service"           = "as-dev-enrollment"
  "department-service"           = "as-dev-department"
  "sports-participation-service" = "as-dev-sports-part"
  "event-configuration-service"  = "as-dev-event-config"
  "scheduling-service"           = "as-dev-scheduling"
  "scoring-service"              = "as-dev-scoring"
  "reporting-service"            = "as-dev-reporting"
}
```

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
terraform apply -var-file=dev.tfvars
```

### 7) Verify

Get ALB DNS:

```bash
terraform output -raw alb_dns_name
```

Then test the API:

```bash
curl -I http://<alb-dns-name>/identities/docs
```

If you provided `acm_certificate_arn` and DNS, use HTTPS:

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
cd infra/aws/ecs/backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Repeat with `qa`, `stg`, `perf`, or `prod` by swapping the backend/tfvars files
(for example, `hcl/backend-qa.hcl` + `tfvars/qa.tfvars.example`).

## Notes
- Configure Secrets Manager secret names in your environment tfvars (for example, `dev.tfvars`).
- The MongoDB URI secret is shared; each service selects the DB via `DATABASE_NAME`.
- Set `route53_zone_id` in tfvars to have Terraform create the API Route 53 record (`api_domain`).
- Redis is provisioned via ElastiCache; the services use that endpoint automatically.
- Cloud Map service discovery is enabled; set an environment-specific `service_discovery_namespace` in tfvars.
- ECS tasks run in private subnets; only the ALB is public.

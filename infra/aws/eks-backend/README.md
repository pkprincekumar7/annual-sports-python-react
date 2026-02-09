# AWS EKS with Terraform (Backend)

Terraform for EKS backend is scaffolded here:

`infra/aws/eks-backend`

Frontend hosting is not part of EKS. Use the shared S3/CloudFront stack at:
`infra/aws/frontend`.

## Prerequisites
- Terraform 1.13+
- AWS CLI configured (`aws configure`)

## Usage

Before you run Terraform, create the S3 bucket and DynamoDB table manually. The
environment backend files are committed so everyone shares the same bucket/table.

Recommended bucket/table setup:
- S3 bucket: versioning enabled, default encryption enabled, public access blocked
- DynamoDB table: partition key `LockID` (string), on-demand billing

```bash
cd infra/aws/eks-backend
```

Verify the environment-specific backend file (for example, `hcl/backend-dev.hcl`)
before running `terraform init`.

```bash
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
```

Verify the environment-specific tfvars file (for example, `dev.tfvars`) after
copying from the matching example file. Update values before `terraform plan`
and `terraform apply`. Required values include `env`, `aws_region`,
`aws_account_id`, subnets/AZs, `api_domain`, and `acm_certificate_arn`.

Create the Secrets Manager resources first (target apply):

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
full stack. Example (AWS CLI):

```bash
NAME_PREFIX=as-dev

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

Then apply the full stack:

```bash
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### Install Metrics Server (HPA prerequisites)

Metrics Server is required for CPU/memory autoscaling. This stack installs the
EKS add-on automatically. If you need to install it manually:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl get deployment -n kube-system metrics-server
kubectl top nodes
```

Verify the add-on status (if using the EKS add-on):

```bash
CLUSTER_NAME=annual-sports-dev
aws eks describe-addon --cluster-name "$CLUSTER_NAME" --addon-name metrics-server
```

### Enable KEDA ALB Scaling

After the ALB ingress is created, fetch the Target Group ARN suffixes for each
service and add them to your tfvars. Enable KEDA scaling after this step.
## Multiple Environments

Use the environment-specific backend files and tfvars templates:

Available environments:
- `dev` → `hcl/backend-dev.hcl`, `tfvars/dev.tfvars.example`
- `qa` → `hcl/backend-qa.hcl`, `tfvars/qa.tfvars.example`
- `stg` → `hcl/backend-stg.hcl`, `tfvars/stg.tfvars.example`
- `perf` → `hcl/backend-perf.hcl`, `tfvars/perf.tfvars.example`
- `prod` → `hcl/backend-prod.hcl`, `tfvars/prod.tfvars.example`

```bash
cd infra/aws/eks-backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Repeat with `qa`, `stg`, `perf`, or `prod` by swapping the backend/tfvars files
(for example, `hcl/backend-qa.hcl` + `tfvars/qa.tfvars.example`).

### ALB Target Group ARN Suffixes (for KEDA)

After the ALB ingress is created, fetch the Target Group ARN suffixes for each
service and add them to your tfvars. Enable KEDA scaling after this step.

Example (AWS CLI):

```bash
LB_ARN=$(aws elbv2 describe-load-balancers --names "as-dev-alb" --query 'LoadBalancers[0].LoadBalancerArn' --output text)

for svc in identity-service enrollment-service department-service sports-participation-service event-configuration-service scheduling-service scoring-service reporting-service; do
  TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn "$LB_ARN" --query "TargetGroups[?contains(TargetGroupName, '$svc')].TargetGroupArn | [0]" --output text)
  TG_ARN_SUFFIX=$(aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --query 'TargetGroups[0].TargetGroupArn' --output text | sed 's#.*/targetgroup/##')
  echo "$svc = \"$TG_ARN_SUFFIX\""
done
```

Then add to tfvars:

```hcl
enable_keda_alb_scaling = true
alb_target_group_arn_suffixes = {
  "identity-service"             = "targetgroup/xxxx/xxxxxxxxxxxx"
  "enrollment-service"           = "targetgroup/xxxx/xxxxxxxxxxxx"
  "department-service"           = "targetgroup/xxxx/xxxxxxxxxxxx"
  "sports-participation-service" = "targetgroup/xxxx/xxxxxxxxxxxx"
  "event-configuration-service"  = "targetgroup/xxxx/xxxxxxxxxxxx"
  "scheduling-service"           = "targetgroup/xxxx/xxxxxxxxxxxx"
  "scoring-service"              = "targetgroup/xxxx/xxxxxxxxxxxx"
  "reporting-service"            = "targetgroup/xxxx/xxxxxxxxxxxx"
}
```

Apply again to enable KEDA scaling:

```bash
terraform apply -var-file=dev.tfvars
```
## Notes
- Secret names are derived from `env` (for example, `as-dev-jwt`, `as-dev-mongo-uri`) and loaded from AWS Secrets Manager.
- Populate Secrets Manager values before applying the stack.
- The ALB controller policy is included; apply creates the controller and Ingress.
- Services are ClusterIP-only; only the ALB ingress is public.
- HPA requires the Kubernetes Metrics Server to be installed in the cluster.
- KEDA is installed for ALB request-based scaling; it uses RequestCountPerTarget per service.
- Amazon CloudWatch Observability add-on is installed for metrics/logging; control plane logs are enabled.
- EKS endpoint is private-only; run Terraform from within the VPC (bastion/SSM/VPN).
- Frontend is hosted via `infra/aws/frontend` (S3 + CloudFront).

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
and `terraform apply`.

```bash
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
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
cd infra/aws/eks-backend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Repeat with `qa`, `stg`, `perf`, or `prod` by swapping the backend/tfvars files
(for example, `hcl/backend-qa.hcl` + `tfvars/qa.tfvars.example`).

## Notes
- Configure Mongo Atlas URI and secrets in your environment tfvars (for example, `dev.tfvars`).
- The ALB controller policy is included; apply creates the controller and Ingress.
- Services are ClusterIP-only; only the ALB ingress is public.
- Frontend is hosted via `infra/aws/frontend` (S3 + CloudFront).

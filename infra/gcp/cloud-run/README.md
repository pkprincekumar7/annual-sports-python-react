# GCP Cloud Run with Terraform (Frontend + Microservices)

Terraform for Cloud Run is scaffolded here:

`infra/gcp/cloud-run`

## Prerequisites
- Terraform 1.13+
- gcloud CLI (`gcloud auth login`)
- GCS bucket for Terraform state

## Usage

Verify the environment-specific backend file (for example, `hcl/backend-dev.hcl`)
before running `terraform init`.

Verify the environment-specific tfvars file (for example, `dev.tfvars`) after
copying from the matching example file. Update values before `terraform plan`
and `terraform apply`.

```bash
cd infra/gcp/cloud-run
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

## Multiple Environments

Available environments:
- `dev` → `hcl/backend-dev.hcl`, `tfvars/dev.tfvars.example`
- `qa` → `hcl/backend-qa.hcl`, `tfvars/qa.tfvars.example`
- `stg` → `hcl/backend-stg.hcl`, `tfvars/stg.tfvars.example`
- `perf` → `hcl/backend-perf.hcl`, `tfvars/perf.tfvars.example`
- `prod` → `hcl/backend-prod.hcl`, `tfvars/prod.tfvars.example`

## Notes
- Provide a globally unique `artifact_registry_name` in tfvars.
- `dns_zone_name` is the DNS domain (for example, `your-domain.com`).
- Set `use_existing_dns_zone = true` and `dns_zone_resource_name` to reuse an existing managed zone.
- Microservices use internal ingress; only the frontend and API gateway are public.

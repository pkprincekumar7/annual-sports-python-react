# Azure Container Apps with Terraform (Frontend + Microservices)

Terraform for Azure Container Apps is scaffolded here:

`new-structure/infra/azure/aca`

## Prerequisites
- Terraform 1.13+
- Azure CLI (`az`) with `az login`
- Azure Storage account + container for Terraform state

## Usage

Verify the environment-specific backend file (for example, `hcl/backend-dev.hcl`)
before running `terraform init`.

Verify the environment-specific tfvars file (for example, `dev.tfvars`) after
copying from the matching example file. Update values before `terraform plan`
and `terraform apply`.

```bash
cd new-structure/infra/azure/aca
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
- Provide a globally unique `acr_name` in tfvars.
- `dns_zone_name` should be the Azure DNS zone (for example, `your-domain.com`).
- Set `use_existing_dns_zone = true` and `dns_zone_resource_group` to reuse an existing Azure DNS zone.
- The API gateway uses an NGINX container image to route requests to service FQDNs.
- Microservices run with internal-only ingress; only the frontend and API gateway are public.

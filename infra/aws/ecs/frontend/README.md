## AWS Frontend (S3 + CloudFront)

This stack configures CloudFront and S3 access for the frontend using an
existing S3 bucket (data source). The bucket is not created or destroyed by
Terraform.

### Prerequisites
- Terraform 1.13+
- AWS CLI configured (`aws configure`)
- Existing S3 bucket per environment (for example: `person-frontend-dev-bucket`)
- CloudFront ACM certificate in `us-east-1` if using a custom domain

### 1) Initialize Terraform

```bash
cd new-structure/infra/aws/ecs/frontend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
```

Update `dev.tfvars`:
- `aws_region` (use `us-east-1`)
- `bucket_name`
- `domain` (optional, custom frontend domain)
- `route53_zone_id` (optional, for DNS record)
- `cloudfront_acm_certificate_arn` (optional, required for custom domain)
- `cloudfront_price_class`

Notes and constraints:
- `aws_region` must match the existing S3 bucket region.
- If you set `domain`, the ACM cert must be in `us-east-1`.
- This stack manages the **entire** bucket policy. If the bucket already has a
  policy, Terraform will replace it.

### 2) Apply

```bash
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### 3) Deploy Frontend Build

```bash
cd ../../../../frontend
VITE_API_URL=https://your-api-domain.com npm install
VITE_API_URL=https://your-api-domain.com npm run build
cd -

FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
aws s3 sync ../../../../frontend/dist "s3://$FRONTEND_BUCKET"
```

Invalidate CloudFront cache after upload:

```bash
CF_DISTRIBUTION_ID=$(terraform output -raw frontend_cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id "$CF_DISTRIBUTION_ID" --paths "/*"
```

Check invalidation status:

```bash
aws cloudfront list-invalidations --distribution-id "$CF_DISTRIBUTION_ID"
aws cloudfront get-invalidation --distribution-id "$CF_DISTRIBUTION_ID" --id "<invalidation-id>"
```

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
cd infra/aws/frontend
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
```

Update `dev.tfvars`:
- `aws_region` (use `us-east-1`)
- `bucket_name`
- `cloudfront_logs_bucket_name` (required if logging enabled)
- `domain` (optional, custom frontend domain)
- `route53_zone_id` (optional, for DNS record)
- `cloudfront_acm_certificate_arn` (optional, required for custom domain)
- `cloudfront_price_class`
- Optional security/ops:
  - `cloudfront_logging_enabled`, `cloudfront_logs_prefix`
  - `cloudfront_minimum_protocol_version`
  - `waf_enabled`
  - `security_headers_enabled`
  - `alarm_sns_topic_arn`
  - `cloudfront_5xx_error_rate_threshold`, `cloudfront_4xx_error_rate_threshold`
- Optional cache tuning:
  - `cloudfront_cache_min_ttl`, `cloudfront_cache_default_ttl`, `cloudfront_cache_max_ttl`
- Optional S3 hardening:
  - `s3_versioning_enabled`, `s3_encryption_enabled`, `s3_noncurrent_version_expiration_days`

Notes and constraints:
- `aws_region` must match the existing S3 bucket region.
- If you set `domain`, the ACM cert must be in `us-east-1`.
- This stack manages the **entire** bucket policy. If the bucket already has a
  policy, Terraform will replace it.
- This stack also manages bucket **encryption**, **versioning**, and **lifecycle**
  for the frontend bucket.
- If `cloudfront_logging_enabled` is true, `cloudfront_logs_bucket_name` must
  refer to an existing bucket. Terraform does not create it, but it will apply
  the required CloudFront log delivery bucket policy (removed on destroy).

Destroy caveats:
- Terraform does **not** delete the frontend S3 bucket or the CloudFront logs bucket.
- Bucket policies and logging policies applied by Terraform are removed on destroy.

### 2) Apply

```bash
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### 3) Deploy Frontend Build

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT/frontend"
VITE_API_URL=https://your-api-domain.com npm install
VITE_API_URL=https://your-api-domain.com npm run build
cd -

FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
aws s3 sync "$REPO_ROOT/frontend/dist" "s3://$FRONTEND_BUCKET"
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

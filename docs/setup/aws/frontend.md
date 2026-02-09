# AWS Frontend Hosting (S3 + CloudFront)

This guide covers hosting the frontend only. Backend deployments are separate:
- ECS backend: `docs/setup/aws/ecs-backend.md`
- EKS backend: `docs/setup/aws/eks-backend.md`

## Prerequisites
- AWS account with permissions for S3, CloudFront, ACM, and Route 53 (optional)
- AWS CLI installed (`aws configure`)
- A domain you control (optional)

## Terraform (Recommended)

Use the dedicated frontend stack:
`infra/aws/frontend/README.md`

## Manual Setup (Console or CLI)

### 0) Set Variables

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
NAME_PREFIX=as-dev
CLOUDFRONT_CERT_ARN=arn:aws:acm:us-east-1:123456789012:certificate/replace-with-your-cloudfront-cert-id
```

### 1) Build the Frontend

```bash
VITE_API_URL=https://your-api-domain.com npm install
VITE_API_URL=https://your-api-domain.com npm run build
```

### 2) Create S3 Bucket and Upload

```bash
FRONTEND_BUCKET=<your-frontend-bucket>

# If the bucket already exists, skip creation.
if ! aws s3api head-bucket --bucket "$FRONTEND_BUCKET" 2>/dev/null; then
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$FRONTEND_BUCKET" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$FRONTEND_BUCKET" --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi
  aws s3api put-public-access-block --bucket "$FRONTEND_BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

aws s3 sync frontend/dist "s3://$FRONTEND_BUCKET"
```

### 3) Create CloudFront Distribution

```bash
## CloudFront requires the certificate in us-east-1
OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config '{
  "Name": "'"${NAME_PREFIX}"'-frontend-oac",
  "Description": "OAC for frontend bucket",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}' --query 'OriginAccessControl.Id' --output text)

cat > cloudfront-frontend.json <<EOF
{
  "CallerReference": "${NAME_PREFIX}-frontend-$(date +%s)",
  "Aliases": { "Quantity": 1, "Items": ["your-domain.com"] },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "s3-frontend",
        "DomainName": "${FRONTEND_BUCKET}.s3.${AWS_REGION}.amazonaws.com",
        "OriginAccessControlId": "${OAC_ID}",
        "S3OriginConfig": { "OriginAccessIdentity": "" }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 3, "Items": ["GET","HEAD","OPTIONS"], "CachedMethods": { "Quantity": 3, "Items": ["GET","HEAD","OPTIONS"] } },
    "Compress": true,
    "ForwardedValues": { "QueryString": false, "Cookies": { "Forward": "none" } }
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponseCode": 200, "ResponsePagePath": "/index.html", "ErrorCachingMinTTL": 0 },
      { "ErrorCode": 404, "ResponseCode": 200, "ResponsePagePath": "/index.html", "ErrorCachingMinTTL": 0 }
    ]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "${CLOUDFRONT_CERT_ARN}",
    "SSLSupportMethod": "sni-only"
  },
  "Restrictions": { "GeoRestriction": { "RestrictionType": "none", "Quantity": 0 } },
  "Enabled": true
}
EOF

CF_ID=$(aws cloudfront create-distribution --distribution-config file://cloudfront-frontend.json --query 'Distribution.Id' --output text)
CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_ID" --query 'Distribution.DomainName' --output text)
```

### 4) Attach S3 Bucket Policy for CloudFront

```bash
cat > s3-frontend-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${FRONTEND_BUCKET}/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${CF_ID}" } }
    }
  ]
}
EOF

aws s3api put-bucket-policy --bucket "$FRONTEND_BUCKET" --policy file://s3-frontend-policy.json
```

### 5) DNS Setup (Optional)

Create a DNS record:
- `your-domain.com` → CloudFront (frontend)

If you do not want a custom frontend domain, skip the record and use the
CloudFront domain directly.

```bash
ROUTE53_ZONE_ID=<your-hosted-zone-id>
CF_ZONE_ID="Z2FDTNDATAQYW2"

aws route53 change-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" --change-batch '{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "your-domain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "'"$CF_ZONE_ID"'",
          "DNSName": "'"$CF_DOMAIN"'",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}'
```

### 6) Verify

```bash
curl -I https://your-domain.com
```

If you did not configure a custom frontend domain:

```bash
curl -I "https://$CF_DOMAIN"
```

# AWS API Edge (Global CloudFront)

This stack provides a single global CloudFront distribution that routes requests
to regional API Gateway endpoints based on a header (active/active).

## Prerequisites
- Terraform 1.13+
- AWS CLI configured (`aws configure`)
- ACM certificate in `us-east-1` for the API domain (optional)

## Inputs
- `origin_domains`: map of origin ID → API Gateway domain (no `https://`)
- `default_origin_id`: origin ID used when the routing header is missing
- `origin_routing_header`: header to select origin (default `x-region`)
- `origin_routing_map`: header value → origin ID
- `geo_routing_enabled`: enable geo routing when header not set
- `geo_routing_map`: country code → origin ID
- `api_domain`, `route53_zone_id`, `cloudfront_acm_certificate_arn` (optional, but if `api_domain` is set then both `route53_zone_id` and `cloudfront_acm_certificate_arn` are required)
- `cloudfront_logs_bucket_name` if logging is enabled

## Example tfvars
```hcl
aws_region  = "us-east-1"
app_prefix  = "as"
env         = "dev"
api_domain   = "sports-dev-api.learning-dev.com"
route53_zone_id = "Z1234567890"
cloudfront_acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/xxx"

origin_domains = {
  "us-east-1"      = "abcd1234.execute-api.us-east-1.amazonaws.com"
  "eu-west-1"      = "wxyz5678.execute-api.eu-west-1.amazonaws.com"
  "ap-southeast-1" = "lmno9012.execute-api.ap-southeast-1.amazonaws.com"
}

default_origin_id = "us-east-1"
origin_routing_header = "x-region"
origin_routing_map = {
  "us-east-1"      = "us-east-1"
  "eu-west-1"      = "eu-west-1"
  "ap-southeast-1" = "ap-southeast-1"
}

geo_routing_enabled = true
geo_routing_map = {
  "US" = "us-east-1"
  "IE" = "eu-west-1"
  "IN" = "ap-southeast-1"
  "SG" = "ap-southeast-1"
}

cloudfront_logging_enabled = true
cloudfront_logs_bucket_name = "person-backend-dev-cf-logs-bucket-us-east-1"
```

## Notes
- This distribution uses a Lambda@Edge viewer-request function to select the
  origin based on a request header, then falls back to geo routing if enabled,
  and finally to `default_origin_id`.
- If `api_domain` is set, Route 53 points the domain to this distribution.

## Outputs Used by Other Stacks
- `cloudfront_domain` for client/API DNS validation
- `route53_record_fqdn` if you need the created DNS record

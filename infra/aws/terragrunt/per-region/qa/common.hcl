locals {
  env = "qa"

  shared = read_terragrunt_config(find_in_parent_folders("_shared/common.hcl")).locals

  app_prefix     = local.shared.app_prefix
  aws_account_id = local.shared.aws_account_id
  route53_zone_id = local.shared.route53_zone_id
  app_s3_bucket_name = local.shared.app_s3_bucket_name
  cloudfront_acm_certificate_arn = local.shared.cloudfront_acm_certificate_arn

  network = local.shared.network
  acm_certificate_arn_by_region = local.shared.acm_certificate_arn_by_region
  alb_logs_bucket_by_region = local.shared.alb_logs_bucket_by_region
  cloudfront_logs_bucket_by_region = local.shared.cloudfront_logs_bucket_by_region

  region_short = {
    "us-east-1"      = "us"
    "eu-west-1"      = "eu"
    "ap-southeast-1" = "ap"
  }

  frontend_domain = local.env == "prod" ? "sports.${local.shared.domain_root}" : "sports-${local.env}.${local.shared.domain_root}"
  frontend_bucket_name = local.env == "prod" ? "your-frontend-prod-bucket" : "your-frontend-${local.env}-bucket"
  frontend_logs_bucket_name = "your-frontend-logs-bucket"

  api_domain_by_region = {
    for r, short in local.region_short :
    r => (local.env == "prod" ? "sports-api-${short}.${local.shared.domain_root}" : "sports-${local.env}-api-${short}.${local.shared.domain_root}")
  }

  apigw_cors_allowed_origins = ["https://${local.frontend_domain}"]

  email_provider             = local.shared.email_provider
  gmail_user                 = local.shared.gmail_user
  email_from                 = local.shared.email_from
  redis_auth_token_bootstrap = local.shared.redis_auth_token_bootstrap

  services = local.shared.services
}

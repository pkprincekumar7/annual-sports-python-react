locals {
  env = "prod"

  shared = read_terragrunt_config(find_in_parent_folders("_shared/common.hcl")).locals

  app_prefix     = local.shared.app_prefix
  aws_account_id = local.shared.aws_account_id
  route53_zone_id = local.shared.route53_zone_id
  app_s3_bucket_name = local.shared.app_s3_bucket_name

  network = local.shared.network
  acm_certificate_arn_by_region = local.shared.acm_certificate_arn_by_region
  alb_logs_bucket_by_region = local.shared.alb_logs_bucket_by_region

  frontend_domain = local.env == "prod" ? "sports.${local.shared.domain_root}" : "sports-${local.env}.${local.shared.domain_root}"
  frontend_bucket_name = local.env == "prod" ? "your-frontend-prod-bucket" : "your-frontend-${local.env}-bucket"
  frontend_logs_bucket_name = local.shared.frontend_logs_bucket_name
  frontend_cloudfront_acm_cert_arn = local.shared.frontend_cloudfront_acm_cert_arn

  global_api_domain = local.env == "prod" ? "sports-api.${local.shared.domain_root}" : "sports-${local.env}-api.${local.shared.domain_root}"
  api_edge_cloudfront_acm_cert_arn = local.shared.api_edge_cloudfront_acm_cert_arn
  api_edge_logs_bucket_name = local.shared.api_edge_logs_bucket_name

  apigw_cors_allowed_origins = ["https://${local.frontend_domain}"]

  email_provider             = local.shared.email_provider
  gmail_user                 = local.shared.gmail_user
  email_from                 = local.shared.email_from
  redis_auth_token_bootstrap = local.shared.redis_auth_token_bootstrap

  geo_routing_enabled = local.shared.geo_routing_enabled
  geo_routing_map = local.shared.geo_routing_map

  services = local.shared.services
}

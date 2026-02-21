include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  cfg    = read_terragrunt_config(find_in_parent_folders("common.hcl"))
  region = "us-east-1"
}

terraform {
  source = "../../../../../ecs-backend"
}

inputs = {
  aws_region     = local.region
  aws_account_id = local.cfg.locals.aws_account_id
  env            = local.cfg.locals.env
  app_prefix     = local.cfg.locals.app_prefix

  vpc_cidr           = local.cfg.locals.network[local.region].vpc_cidr
  availability_zones = local.cfg.locals.network[local.region].availability_zones
  public_subnets     = local.cfg.locals.network[local.region].public_subnets
  private_subnets    = local.cfg.locals.network[local.region].private_subnets

  cloudfront_enabled             = true
  api_domain                     = local.cfg.locals.api_domain_by_region[local.region]
  route53_zone_id                = local.cfg.locals.route53_zone_id
  acm_certificate_arn            = local.cfg.locals.acm_certificate_arn_by_region[local.region]
  cloudfront_acm_certificate_arn = local.cfg.locals.cloudfront_acm_certificate_arn

  alb_access_logs_bucket_name = local.cfg.locals.alb_logs_bucket_by_region[local.region]
  cloudfront_logs_bucket_name = local.cfg.locals.cloudfront_logs_bucket_by_region[local.region]
  app_s3_bucket_name          = local.cfg.locals.app_s3_bucket_name

  apigw_cors_allowed_origins = local.cfg.locals.apigw_cors_allowed_origins
  email_provider             = local.cfg.locals.email_provider
  gmail_user                 = local.cfg.locals.gmail_user
  email_from                 = local.cfg.locals.email_from
  redis_auth_token_bootstrap = local.cfg.locals.redis_auth_token_bootstrap

  services = local.cfg.locals.services
}

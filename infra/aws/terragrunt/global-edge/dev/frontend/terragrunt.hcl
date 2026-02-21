include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  cfg = read_terragrunt_config(find_in_parent_folders("common.hcl"))
}

terraform {
  source = "../../../../frontend"
}

inputs = {
  aws_region                     = "us-east-1"
  bucket_name                    = local.cfg.locals.frontend_bucket_name
  cloudfront_logs_bucket_name    = local.cfg.locals.frontend_logs_bucket_name
  domain                         = local.cfg.locals.frontend_domain
  route53_zone_id                = local.cfg.locals.route53_zone_id
  cloudfront_acm_certificate_arn = local.cfg.locals.frontend_cloudfront_acm_cert_arn
}

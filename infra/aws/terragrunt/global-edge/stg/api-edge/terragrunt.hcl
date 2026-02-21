include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  cfg = read_terragrunt_config(find_in_parent_folders("common.hcl"))
}

terraform {
  source = "../../../../api-edge"
}

dependency "backend_us_east_1" {
  config_path = "../ecs-backend-global/us-east-1"
  mock_outputs = {
    api_gateway_endpoint = "https://mock-us.execute-api.us-east-1.amazonaws.com"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_eu_west_1" {
  config_path = "../ecs-backend-global/eu-west-1"
  mock_outputs = {
    api_gateway_endpoint = "https://mock-eu.execute-api.eu-west-1.amazonaws.com"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_ap_southeast_1" {
  config_path = "../ecs-backend-global/ap-southeast-1"
  mock_outputs = {
    api_gateway_endpoint = "https://mock-ap.execute-api.ap-southeast-1.amazonaws.com"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  aws_region  = "us-east-1"
  app_prefix  = local.cfg.locals.app_prefix
  env         = local.cfg.locals.env
  api_domain  = local.cfg.locals.global_api_domain
  route53_zone_id                 = local.cfg.locals.route53_zone_id
  cloudfront_acm_certificate_arn  = local.cfg.locals.api_edge_cloudfront_acm_cert_arn
  cloudfront_logs_bucket_name     = local.cfg.locals.api_edge_logs_bucket_name
  geo_routing_enabled             = local.cfg.locals.geo_routing_enabled
  geo_routing_map                 = local.cfg.locals.geo_routing_map
  default_origin_id               = "us-east-1"
  origin_routing_header           = "x-region"
  origin_domains = {
    "us-east-1"      = replace(dependency.backend_us_east_1.outputs.api_gateway_endpoint, "https://", "")
    "eu-west-1"      = replace(dependency.backend_eu_west_1.outputs.api_gateway_endpoint, "https://", "")
    "ap-southeast-1" = replace(dependency.backend_ap_southeast_1.outputs.api_gateway_endpoint, "https://", "")
  }
  origin_routing_map = {
    "us-east-1"      = "us-east-1"
    "eu-west-1"      = "eu-west-1"
    "ap-southeast-1" = "ap-southeast-1"
  }
}

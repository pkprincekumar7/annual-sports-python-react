provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  name_prefix    = "${var.app_prefix}-${var.env}"
  use_api_domain = var.api_domain != "" && var.route53_zone_id != "" && var.cloudfront_acm_certificate_arn != ""
}

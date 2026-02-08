provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  use_frontend_domain = var.route53_zone_id != "" && var.domain != "" && var.cloudfront_acm_certificate_arn != ""
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

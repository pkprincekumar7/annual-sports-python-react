provider "aws" {
  region = var.aws_region
}

locals {
  use_frontend_domain = var.route53_zone_id != "" && var.domain != "" && var.cloudfront_acm_certificate_arn != ""
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

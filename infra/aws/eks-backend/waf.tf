resource "aws_wafv2_web_acl" "cloudfront" {
  provider = aws.us_east_1
  count    = var.cloudfront_enabled && var.waf_enabled ? 1 : 0

  name  = "${local.iam_name_prefix}-cloudfront-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.iam_name_prefix}-cloudfront-waf-common"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.iam_name_prefix}-cloudfront-waf"
  }
}

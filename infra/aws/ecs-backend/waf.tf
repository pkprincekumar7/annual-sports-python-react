resource "aws_wafv2_web_acl" "alb" {
  count = var.waf_enabled ? 1 : 0

  name  = "${local.name_prefix}-alb-waf"
  scope = "REGIONAL"

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
      metric_name                = "${local.name_prefix}-waf-common"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.waf_enabled ? 1 : 0
  resource_arn = aws_lb.app.arn
  web_acl_arn  = aws_wafv2_web_acl.alb[0].arn
}

resource "aws_wafv2_web_acl" "apigw" {
  count = var.waf_enabled ? 1 : 0

  name  = "${local.name_prefix}-apigw-waf"
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
      metric_name                = "${local.name_prefix}-apigw-waf-common"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-apigw-waf"
  }
}

resource "aws_wafv2_web_acl_association" "apigw" {
  count        = var.waf_enabled ? 1 : 0
  resource_arn = aws_apigatewayv2_stage.default.arn
  web_acl_arn  = aws_wafv2_web_acl.apigw[0].arn
}

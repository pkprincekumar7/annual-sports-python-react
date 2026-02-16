data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  apigw_origin_domain = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")
}

resource "aws_cloudfront_distribution" "api" {
  count               = var.cloudfront_enabled ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""
  comment             = "${local.name_prefix}-api"

  aliases = var.api_domain != "" ? [var.api_domain] : []

  origin {
    domain_name = local.apigw_origin_domain
    origin_id   = "apigw-http"
    origin_path = ""

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "apigw-http"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.api_domain == ""
    acm_certificate_arn            = var.api_domain != "" ? var.cloudfront_acm_certificate_arn : null
    ssl_support_method             = var.api_domain != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  dynamic "logging_config" {
    for_each = var.cloudfront_enabled && var.cloudfront_logging_enabled ? [1] : []
    content {
      bucket          = data.aws_s3_bucket.cloudfront_logs[0].bucket_regional_domain_name
      include_cookies = false
      prefix          = ""
    }
  }

  web_acl_id = var.waf_enabled ? aws_wafv2_web_acl.cloudfront[0].arn : null
}

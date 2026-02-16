data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix}-api-edge"

  aliases = local.use_api_domain ? [var.api_domain] : []

  dynamic "origin" {
    for_each = var.origin_domains
    content {
      domain_name = origin.value
      origin_id   = origin.key

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = var.default_origin_id
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    lambda_function_association {
      event_type = "viewer-request"
      lambda_arn = aws_lambda_function.origin_router.qualified_arn
      include_body = false
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.use_api_domain ? false : true
    acm_certificate_arn            = local.use_api_domain ? var.cloudfront_acm_certificate_arn : null
    ssl_support_method             = local.use_api_domain ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  dynamic "logging_config" {
    for_each = var.cloudfront_logging_enabled ? [1] : []
    content {
      bucket          = data.aws_s3_bucket.cloudfront_logs[0].bucket_regional_domain_name
      include_cookies = false
      prefix          = ""
    }
  }

  price_class = var.cloudfront_price_class

  web_acl_id = var.waf_enabled ? aws_wafv2_web_acl.cloudfront[0].arn : null
}

resource "aws_route53_record" "api_domain" {
  count   = local.use_api_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = true
  }
}

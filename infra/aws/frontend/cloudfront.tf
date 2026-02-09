resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "frontend" {
  name        = "${var.bucket_name}-cache-policy"
  default_ttl = var.cloudfront_cache_default_ttl
  max_ttl     = var.cloudfront_cache_max_ttl
  min_ttl     = var.cloudfront_cache_min_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_response_headers_policy" "frontend" {
  count = var.security_headers_enabled ? 1 : 0
  name  = "${var.bucket_name}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  price_class         = var.cloudfront_price_class
  default_root_object = "index.html"

  aliases = local.use_frontend_domain ? [var.domain] : []

  origin {
    domain_name              = data.aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress = true

    cache_policy_id            = aws_cloudfront_cache_policy.frontend.id
    response_headers_policy_id = var.security_headers_enabled ? aws_cloudfront_response_headers_policy.frontend[0].id : null
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 500
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 502
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 503
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 504
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.cloudfront_acm_certificate_arn == ""
    acm_certificate_arn            = var.cloudfront_acm_certificate_arn == "" ? null : var.cloudfront_acm_certificate_arn
    ssl_support_method             = var.cloudfront_acm_certificate_arn == "" ? null : "sni-only"
    minimum_protocol_version       = var.cloudfront_acm_certificate_arn == "" ? null : var.cloudfront_minimum_protocol_version
  }

  dynamic "logging_config" {
    for_each = var.cloudfront_logging_enabled ? [1] : []
    content {
      include_cookies = false
      bucket          = data.aws_s3_bucket.cloudfront_logs[0].bucket_domain_name
      prefix          = var.cloudfront_logs_prefix
    }
  }

  web_acl_id = var.waf_enabled ? aws_wafv2_web_acl.frontend[0].arn : null
}

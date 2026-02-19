variable "aws_region" {
  type        = string
  description = "AWS region for frontend resources (use us-east-1)."
  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "aws_region must be us-east-1 for the frontend stack."
  }
}

variable "bucket_name" {
  type        = string
  description = "Existing S3 bucket name for frontend assets."
  validation {
    condition     = var.bucket_name != ""
    error_message = "bucket_name must be set."
  }
}

variable "cloudfront_logs_bucket_name" {
  type        = string
  default     = ""
  description = "Optional existing S3 bucket name for CloudFront access logs."
  validation {
    condition     = var.cloudfront_logging_enabled ? var.cloudfront_logs_bucket_name != "" : true
    error_message = "cloudfront_logs_bucket_name must be set when cloudfront_logging_enabled is true."
  }
}

variable "cloudfront_logging_enabled" {
  type        = bool
  default     = true
  description = "Enable CloudFront access logging."
}

variable "cloudfront_logs_prefix" {
  type        = string
  default     = "cloudfront"
  description = "S3 prefix for CloudFront access logs."
}

variable "domain" {
  type        = string
  default     = ""
  description = "Optional frontend domain for CloudFront."
  validation {
    condition     = var.domain == "" || var.route53_zone_id != ""
    error_message = "route53_zone_id must be set when domain is provided."
  }
  validation {
    condition     = var.domain == "" || var.cloudfront_acm_certificate_arn != ""
    error_message = "cloudfront_acm_certificate_arn must be set when domain is provided."
  }
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional Route 53 hosted zone ID for frontend DNS record."
}

variable "cloudfront_acm_certificate_arn" {
  type        = string
  default     = ""
  description = "Optional ACM certificate ARN (us-east-1) for CloudFront custom domain."
}

variable "cloudfront_minimum_protocol_version" {
  type        = string
  default     = "TLSv1.2_2021"
  description = "Minimum TLS protocol version for CloudFront viewers."
}

variable "cloudfront_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class."
}

variable "cloudfront_cache_min_ttl" {
  type        = number
  default     = 0
  description = "Minimum TTL for CloudFront cache (seconds)."
}

variable "cloudfront_cache_default_ttl" {
  type        = number
  default     = 3600
  description = "Default TTL for CloudFront cache (seconds)."
}

variable "cloudfront_cache_max_ttl" {
  type        = number
  default     = 86400
  description = "Maximum TTL for CloudFront cache (seconds)."
}

variable "waf_enabled" {
  type        = bool
  default     = true
  description = "Enable AWS WAF for CloudFront."
}

variable "security_headers_enabled" {
  type        = bool
  default     = true
  description = "Enable security headers policy for CloudFront responses."
}

variable "s3_versioning_enabled" {
  type        = bool
  default     = true
  description = "Enable S3 bucket versioning for frontend assets."
}

variable "s3_encryption_enabled" {
  type        = bool
  default     = true
  description = "Enable S3 default encryption for frontend assets bucket."
}

variable "s3_noncurrent_version_expiration_days" {
  type        = number
  default     = 30
  description = "Days to retain noncurrent S3 object versions."
}

variable "alarm_sns_topic_arn" {
  type        = string
  default     = ""
  description = "Optional SNS topic ARN for CloudFront alarms."
}

variable "cloudfront_5xx_error_rate_threshold" {
  type        = number
  default     = 1
  description = "CloudFront 5xx error rate alarm threshold (percent)."
}

variable "cloudfront_4xx_error_rate_threshold" {
  type        = number
  default     = 5
  description = "CloudFront 4xx error rate alarm threshold (percent)."
}

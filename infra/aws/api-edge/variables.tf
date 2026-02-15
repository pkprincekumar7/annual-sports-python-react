variable "aws_region" {
  type        = string
  description = "AWS region for the global edge stack (use us-east-1)."
  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "aws_region must be us-east-1 for the global edge stack."
  }
}

variable "app_prefix" {
  type        = string
  description = "Application prefix."
}

variable "env" {
  type        = string
  description = "Environment name (dev, qa, stg, perf, prod)."
}

variable "origin_domains" {
  type        = map(string)
  description = "Origin ID to API Gateway domain (no https://)."
}

variable "default_origin_id" {
  type        = string
  description = "Default origin ID used when routing does not match."
  validation {
    condition     = contains(keys(var.origin_domains), var.default_origin_id)
    error_message = "default_origin_id must exist in origin_domains."
  }
}

variable "origin_routing_header" {
  type        = string
  default     = "x-region"
  description = "Header used to select origin (e.g., x-region)."
}

variable "origin_routing_map" {
  type        = map(string)
  default     = {}
  description = "Map of header value to origin ID."
}

variable "geo_routing_enabled" {
  type        = bool
  default     = false
  description = "Enable geo-based routing when header routing does not match."
}

variable "geo_routing_map" {
  type        = map(string)
  default     = {}
  description = "Map of country code (e.g., US, IN) to origin ID."
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Optional custom domain for the API (points to global CloudFront)."
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional Route 53 hosted zone ID for API DNS."
}

variable "cloudfront_acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN (us-east-1) for CloudFront custom domain."
  validation {
    condition     = var.api_domain == "" || var.cloudfront_acm_certificate_arn != ""
    error_message = "cloudfront_acm_certificate_arn must be set when api_domain is provided."
  }
}

variable "cloudfront_logging_enabled" {
  type        = bool
  default     = true
  description = "Enable CloudFront access logging."
}

variable "cloudfront_logs_bucket_name" {
  type        = string
  default     = ""
  description = "Existing S3 bucket name for CloudFront access logs."
  validation {
    condition     = var.cloudfront_logging_enabled ? var.cloudfront_logs_bucket_name != "" : true
    error_message = "cloudfront_logs_bucket_name must be set when cloudfront_logging_enabled is true."
  }
}

variable "cloudfront_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class."
}

variable "waf_enabled" {
  type        = bool
  default     = true
  description = "Enable AWS WAF for CloudFront."
}

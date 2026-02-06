variable "aws_region" {
  type        = string
  description = "AWS region for frontend resources (use us-east-1)."
}

variable "bucket_name" {
  type        = string
  description = "Existing S3 bucket name for frontend assets."
}

variable "domain" {
  type        = string
  default     = ""
  description = "Optional frontend domain for CloudFront."
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

variable "cloudfront_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class."
}

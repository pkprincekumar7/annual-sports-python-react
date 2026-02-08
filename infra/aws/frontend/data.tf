data "aws_s3_bucket" "frontend" {
  bucket = var.bucket_name
}

data "aws_s3_bucket" "cloudfront_logs" {
  count  = var.cloudfront_logging_enabled && var.cloudfront_logs_bucket_name != "" ? 1 : 0
  bucket = var.cloudfront_logs_bucket_name
}

data "aws_cloudfront_log_delivery_canonical_user_id" "this" {}

resource "null_resource" "cloudfront_logs_bucket_check" {
  lifecycle {
    precondition {
      condition     = var.cloudfront_logging_enabled ? var.cloudfront_logs_bucket_name != "" : true
      error_message = "cloudfront_logs_bucket_name must be set when cloudfront_logging_enabled is true."
    }
  }
}

resource "null_resource" "frontend_bucket_region_check" {
  lifecycle {
    precondition {
      condition = (
        data.aws_s3_bucket.frontend.region == null ||
        data.aws_s3_bucket.frontend.region == "" ||
        data.aws_s3_bucket.frontend.region == var.aws_region
      )
      error_message = "bucket_name must be in the same region as aws_region."
    }
  }
}

# ALB access logs: configure existing S3 bucket for ALB log delivery.
# The ALB is created by the AWS Load Balancer Controller; access logs are enabled via Ingress annotations.
data "aws_s3_bucket" "alb_logs" {
  count  = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  bucket = var.alb_access_logs_bucket_name
}

resource "null_resource" "alb_logs_region_check" {
  count = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  lifecycle {
    precondition {
      condition = (
        data.aws_s3_bucket.alb_logs[0].region == null ||
        data.aws_s3_bucket.alb_logs[0].region == "" ||
        data.aws_s3_bucket.alb_logs[0].region == var.aws_region
      )
      error_message = "alb_access_logs_bucket_name must be in the same region as aws_region."
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  count  = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  bucket = data.aws_s3_bucket.alb_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  count  = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  bucket = data.aws_s3_bucket.alb_logs[0].id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  count  = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  bucket = data.aws_s3_bucket.alb_logs[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "alb_logs" {
  count = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  statement {
    sid    = "AWSLogDeliveryWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${data.aws_s3_bucket.alb_logs[0].arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }

  statement {
    sid    = "AWSLogDeliveryAclCheck"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [data.aws_s3_bucket.alb_logs[0].arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  count  = var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? 1 : 0
  bucket = data.aws_s3_bucket.alb_logs[0].id
  policy = data.aws_iam_policy_document.alb_logs[0].json
}

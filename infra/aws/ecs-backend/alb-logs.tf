data "aws_s3_bucket" "alb_logs" {
  bucket = local.alb_logs_bucket_name
}

resource "null_resource" "alb_logs_region_check" {
  lifecycle {
    precondition {
      condition = (
        data.aws_s3_bucket.alb_logs.region == null ||
        data.aws_s3_bucket.alb_logs.region == "" ||
        data.aws_s3_bucket.alb_logs.region == var.aws_region
      )
      error_message = "alb_access_logs_bucket_name must be in the same region as aws_region."
    }
  }
}
resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = data.aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = data.aws_s3_bucket.alb_logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = data.aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid    = "AWSLogDeliveryWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${data.aws_s3_bucket.alb_logs.arn}/*"]
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
    resources = [data.aws_s3_bucket.alb_logs.arn]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = data.aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json
}

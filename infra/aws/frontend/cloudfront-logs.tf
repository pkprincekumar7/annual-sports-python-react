data "aws_iam_policy_document" "cloudfront_logs" {
  count = var.cloudfront_logging_enabled ? 1 : 0

  statement {
    sid    = "CloudFrontLogsWrite"
    effect = "Allow"
    principals {
      type        = "CanonicalUser"
      identifiers = [data.aws_cloudfront_log_delivery_canonical_user_id.this.id]
    }
    actions   = ["s3:PutObject"]
    resources = ["${data.aws_s3_bucket.cloudfront_logs[0].arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }

  statement {
    sid    = "CloudFrontLogsAclCheck"
    effect = "Allow"
    principals {
      type        = "CanonicalUser"
      identifiers = [data.aws_cloudfront_log_delivery_canonical_user_id.this.id]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [data.aws_s3_bucket.cloudfront_logs[0].arn]
  }
}

resource "aws_s3_bucket_policy" "cloudfront_logs" {
  count  = var.cloudfront_logging_enabled ? 1 : 0
  bucket = data.aws_s3_bucket.cloudfront_logs[0].id
  policy = data.aws_iam_policy_document.cloudfront_logs[0].json
}

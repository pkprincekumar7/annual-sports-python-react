data "aws_s3_bucket" "app" {
  bucket = var.bucket_name
}

data "aws_iam_policy_document" "app_bucket" {
  statement {
    sid    = "AllowListBucket"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = var.task_role_arns
    }
    actions   = ["s3:ListBucket"]
    resources = [data.aws_s3_bucket.app.arn]
  }

  statement {
    sid    = "AllowObjectAccess"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = var.task_role_arns
    }
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject"
    ]
    resources = ["${data.aws_s3_bucket.app.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "app" {
  bucket = data.aws_s3_bucket.app.id
  policy = data.aws_iam_policy_document.app_bucket.json
}

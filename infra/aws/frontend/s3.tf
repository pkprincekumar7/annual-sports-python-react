resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = data.aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = data.aws_s3_bucket.frontend.id
  versioning_configuration {
    status = var.s3_versioning_enabled ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = data.aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
  lifecycle {
    precondition {
      condition     = var.s3_encryption_enabled
      error_message = "s3_encryption_enabled must be true for production-grade setup."
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = data.aws_s3_bucket.frontend.id

  rule {
    id     = "expire-noncurrent-versions"
    status = var.s3_versioning_enabled ? "Enabled" : "Disabled"

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_expiration_days
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket     = data.aws_s3_bucket.frontend.id
  depends_on = [aws_s3_bucket_public_access_block.frontend]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${data.aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

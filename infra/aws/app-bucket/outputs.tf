output "bucket_name" {
  value       = data.aws_s3_bucket.app.id
  description = "App S3 bucket name."
}

output "bucket_arn" {
  value       = data.aws_s3_bucket.app.arn
  description = "App S3 bucket ARN."
}

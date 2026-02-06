output "frontend_bucket_name" {
  value       = data.aws_s3_bucket.frontend.bucket
  description = "S3 bucket name for frontend assets."
}

output "frontend_cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.frontend.domain_name
  description = "CloudFront domain name for frontend."
}

output "frontend_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.frontend.id
  description = "CloudFront distribution ID for frontend."
}

output "cloudfront_domain" {
  value       = aws_cloudfront_distribution.api.domain_name
  description = "CloudFront distribution domain for the API."
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.api.id
  description = "CloudFront distribution ID."
}

output "api_domain" {
  value       = var.api_domain
  description = "API domain (if set)."
}

output "route53_record_fqdn" {
  value       = local.use_api_domain ? aws_route53_record.api_domain[0].fqdn : null
  description = "Route 53 record FQDN (if created)."
}

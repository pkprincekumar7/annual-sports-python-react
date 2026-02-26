data "aws_lb" "app_output" {
  name       = local.alb_name
  depends_on = [kubernetes_ingress_v1.alb]
}

output "cluster_name" {
  value       = module.eks.cluster_name
  description = "EKS cluster name."
}

output "env" {
  value       = var.env
  description = "Environment name."
}

output "aws_region" {
  value       = var.aws_region
  description = "AWS region."
}

output "alb_arn" {
  value       = data.aws_lb.app_output.arn
  description = "ALB ARN."
}

output "alb_dns_name" {
  value       = data.aws_lb.app_output.dns_name
  description = "ALB DNS name."
}

output "cluster_endpoint" {
  value       = module.eks.cluster_endpoint
  description = "EKS cluster endpoint."
}

output "ecr_repository_urls" {
  value       = { for name, repo in aws_ecr_repository.repos : name => repo.repository_url }
  description = "ECR repository URLs."
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "ElastiCache Redis endpoint."
}

output "redis_url" {
  value       = local.redis_url
  description = "Redis connection URL."
  sensitive   = true
}

output "alb_hostname" {
  value       = try(kubernetes_ingress_v1.alb.status[0].load_balancer[0].ingress[0].hostname, null)
  description = "ALB hostname from Ingress (private when cloudfront_enabled)."
}

output "api_gateway_endpoint" {
  value       = var.cloudfront_enabled ? aws_apigatewayv2_api.http[0].api_endpoint : null
  description = "API Gateway endpoint (when cloudfront_enabled)."
}

output "api_gateway_id" {
  value       = var.cloudfront_enabled ? aws_apigatewayv2_api.http[0].id : null
  description = "API Gateway ID (when cloudfront_enabled)."
}

output "cloudfront_domain" {
  value       = var.cloudfront_enabled ? aws_cloudfront_distribution.api[0].domain_name : null
  description = "CloudFront distribution domain for the API (when cloudfront_enabled)."
}

output "cloudfront_enabled" {
  value       = var.cloudfront_enabled
  description = "Whether Private ALB → API Gateway → CloudFront → WAF is enabled."
}

output "name_prefix" {
  value       = local.name_prefix
  description = "Name prefix (app_prefix-env)."
}

output "app_prefix" {
  value       = var.app_prefix
  description = "Application prefix."
}

output "task_role_arns" {
  value       = { for name, role in aws_iam_role.service_irsa : name => role.arn }
  description = "EKS pod (IRSA) role ARNs per service for app-bucket stack."
}

output "api_domain" {
  value       = var.api_domain
  description = "API domain (if set)."
}

output "route53_zone_id" {
  value       = var.route53_zone_id
  description = "Route 53 hosted zone ID (if set)."
}

output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "VPC ID."
}

output "private_subnet_ids" {
  value       = module.vpc.private_subnets
  description = "Private subnet IDs."
}

output "public_subnet_ids" {
  value       = module.vpc.public_subnets
  description = "Public subnet IDs."
}

output "cloudfront_logs_bucket_name" {
  value       = var.cloudfront_logs_bucket_name
  description = "CloudFront logs bucket name."
}

output "alb_access_logs_bucket_name" {
  value       = var.alb_access_logs_bucket_name
  description = "ALB access logs bucket name."
}

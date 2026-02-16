output "alb_dns_name" {
  value       = aws_lb.app.dns_name
  description = "ALB DNS name."
}

output "alb_arn" {
  value       = aws_lb.app.arn
  description = "ALB ARN."
}

output "api_gateway_endpoint" {
  value       = aws_apigatewayv2_api.http.api_endpoint
  description = "Default API Gateway endpoint."
}

output "api_gateway_id" {
  value       = aws_apigatewayv2_api.http.id
  description = "API Gateway ID."
}

output "cloudfront_domain" {
  value       = var.cloudfront_enabled ? aws_cloudfront_distribution.api[0].domain_name : null
  description = "CloudFront distribution domain for the API."
}

output "redis_endpoint" {
  value       = local.redis_host
  description = "Redis endpoint."
}

output "redis_url" {
  value       = local.redis_base_url
  description = "Redis connection URL."
  sensitive   = true
}

output "service_discovery_namespace" {
  value       = aws_service_discovery_private_dns_namespace.namespace.name
  description = "Service discovery namespace."
}

output "name_prefix" {
  value       = local.name_prefix
  description = "Name prefix (app_prefix-env)."
}

output "app_prefix" {
  value       = var.app_prefix
  description = "Application prefix."
}

output "env" {
  value       = var.env
  description = "Environment name."
}

output "aws_region" {
  value       = var.aws_region
  description = "AWS region."
}

output "api_domain" {
  value       = var.api_domain
  description = "API domain (if set)."
}

output "route53_zone_id" {
  value       = var.route53_zone_id
  description = "Route 53 hosted zone ID (if set)."
}

output "cloudfront_enabled" {
  value       = var.cloudfront_enabled
  description = "Whether regional CloudFront is enabled."
}

output "cloudfront_logs_bucket_name" {
  value       = var.cloudfront_logs_bucket_name
  description = "CloudFront logs bucket name."
}

output "alb_access_logs_bucket_name" {
  value       = var.alb_access_logs_bucket_name
  description = "ALB access logs bucket name."
}

output "ecr_repository_urls" {
  value       = { for name, repo in aws_ecr_repository.repos : name => repo.repository_url }
  description = "ECR repository URLs."
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

output "ecs_tasks_security_group_id" {
  value       = aws_security_group.ecs_tasks.id
  description = "ECS tasks security group ID."
}

output "task_role_arns" {
  value       = { for name, role in aws_iam_role.task_role : name => role.arn }
  description = "ECS task role ARNs per service."
}

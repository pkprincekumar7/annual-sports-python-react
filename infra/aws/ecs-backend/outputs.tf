output "alb_dns_name" {
  value       = aws_lb.app.dns_name
  description = "ALB DNS name."
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "ElastiCache Redis endpoint."
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

output "ecr_repository_urls" {
  value       = { for name, repo in aws_ecr_repository.repos : name => repo.repository_url }
  description = "ECR repository URLs."
}

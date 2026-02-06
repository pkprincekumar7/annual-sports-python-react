output "cluster_name" {
  value       = module.eks.cluster_name
  description = "EKS cluster name."
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
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  description = "ElastiCache Redis endpoint."
}

output "redis_url" {
  value       = local.redis_url
  description = "Redis connection URL."
}

output "alb_hostname" {
  value       = try(kubernetes_ingress_v1.alb.status[0].load_balancer[0].ingress[0].hostname, null)
  description = "ALB hostname from Ingress."
}

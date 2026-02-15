output "global_replication_group_id" {
  value       = aws_elasticache_global_replication_group.global.global_replication_group_id
  description = "Global replication group ID."
}

output "primary_endpoint" {
  value       = aws_elasticache_replication_group.primary.primary_endpoint_address
  description = "Primary region Redis endpoint."
}

output "primary_reader_endpoint" {
  value       = aws_elasticache_replication_group.primary.reader_endpoint_address
  description = "Primary region Redis reader endpoint."
}

output "eu_west_1_endpoint" {
  value       = var.enable_eu_west_1 ? aws_elasticache_replication_group.eu_west_1[0].primary_endpoint_address : null
  description = "eu-west-1 Redis endpoint."
}

output "ap_southeast_1_endpoint" {
  value       = var.enable_ap_southeast_1 ? aws_elasticache_replication_group.ap_southeast_1[0].primary_endpoint_address : null
  description = "ap-southeast-1 Redis endpoint."
}

output "regional_endpoints" {
  value = {
    us_east_1      = aws_elasticache_replication_group.primary.primary_endpoint_address
    eu_west_1      = var.enable_eu_west_1 ? aws_elasticache_replication_group.eu_west_1[0].primary_endpoint_address : null
    ap_southeast_1 = var.enable_ap_southeast_1 ? aws_elasticache_replication_group.ap_southeast_1[0].primary_endpoint_address : null
  }
  description = "Redis endpoints by region."
}

output "name_prefix" {
  value       = local.name_prefix
  description = "Name prefix for Redis global resources."
}

output "primary_region" {
  value       = var.primary_region
  description = "Primary region."
}

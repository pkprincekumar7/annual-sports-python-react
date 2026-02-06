output "resource_group_name" {
  value       = azurerm_resource_group.rg.name
  description = "Resource group name."
}

output "aks_name" {
  value       = azurerm_kubernetes_cluster.aks.name
  description = "AKS cluster name."
}

output "acr_login_server" {
  value       = azurerm_container_registry.acr.login_server
  description = "ACR login server."
}

output "redis_hostname" {
  value       = azurerm_redis_cache.redis.hostname
  description = "Redis hostname."
}

output "ingress_public_ip" {
  value       = azurerm_public_ip.ingress.ip_address
  description = "Ingress public IP address."
}

output "frontend_domain" {
  value       = var.domain
  description = "Frontend domain."
}

output "api_domain" {
  value       = var.api_domain
  description = "API domain."
}

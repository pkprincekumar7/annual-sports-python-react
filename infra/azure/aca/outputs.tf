output "resource_group_name" {
  value       = azurerm_resource_group.rg.name
  description = "Resource group name."
}

output "aca_environment_name" {
  value       = azurerm_container_app_environment.env.name
  description = "Container Apps environment name."
}

output "acr_login_server" {
  value       = azurerm_container_registry.acr.login_server
  description = "ACR login server."
}

output "frontend_fqdn" {
  value       = azurerm_container_app.frontend.ingress[0].fqdn
  description = "Frontend FQDN."
}

output "api_gateway_fqdn" {
  value       = azurerm_container_app.api_gateway.ingress[0].fqdn
  description = "API gateway FQDN."
}

output "redis_hostname" {
  value       = azurerm_redis_cache.redis.hostname
  description = "Redis hostname."
}

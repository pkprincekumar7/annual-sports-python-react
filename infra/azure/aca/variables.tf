variable "subscription_id" {
  type        = string
  description = "Azure subscription ID."
}

variable "tenant_id" {
  type        = string
  default     = ""
  description = "Azure tenant ID (optional if using Azure CLI auth)."
}

variable "location" {
  type        = string
  default     = "eastus"
  description = "Azure region."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group for all Container Apps resources."
}

variable "dns_zone_name" {
  type        = string
  description = "Azure DNS zone name (for example, your-domain.com)."
}

variable "dns_zone_resource_group" {
  type        = string
  default     = ""
  description = "Resource group of an existing Azure DNS zone (required when use_existing_dns_zone = true)."
  validation {
    condition     = !var.use_existing_dns_zone || length(trimspace(var.dns_zone_resource_group)) > 0
    error_message = "dns_zone_resource_group must be set when use_existing_dns_zone is true."
  }
}

variable "use_existing_dns_zone" {
  type        = bool
  default     = false
  description = "Use an existing Azure DNS zone instead of creating one."
}

variable "domain" {
  type        = string
  description = "Primary domain for the frontend."
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Optional API domain."
}

variable "aca_environment_name" {
  type        = string
  default     = "annual-sports-aca"
  description = "Container Apps environment name."
}

variable "log_analytics_workspace_name" {
  type        = string
  default     = "annual-sports-logs"
  description = "Log Analytics workspace name."
}

variable "acr_name" {
  type        = string
  description = "Azure Container Registry name (globally unique)."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for all services."
}

variable "api_gateway_image" {
  type        = string
  default     = "nginx:alpine"
  description = "Container image for the API gateway (nginx by default)."
}

variable "service_cpu" {
  type        = number
  default     = 0.5
  description = "CPU for each service container."
}

variable "service_memory" {
  type        = string
  default     = "1Gi"
  description = "Memory for each service container."
}

variable "frontend_cpu" {
  type        = number
  default     = 0.25
  description = "CPU for frontend container."
}

variable "frontend_memory" {
  type        = string
  default     = "0.5Gi"
  description = "Memory for frontend container."
}

variable "redis_sku_name" {
  type        = string
  default     = "Basic"
  description = "Azure Cache for Redis SKU name."
}

variable "redis_family" {
  type        = string
  default     = "C"
  description = "Redis family for SKU."
}

variable "redis_capacity" {
  type        = number
  default     = 0
  description = "Redis capacity (0 for Basic C0)."
}

variable "mongo_uris" {
  type        = map(string)
  description = "MongoDB Atlas URIs per service."
}

variable "database_names" {
  type        = map(string)
  description = "Database names per service."
}

variable "jwt_secret" {
  type        = string
  description = "JWT secret for all services."
}

variable "jwt_expires_in" {
  type        = string
  default     = "24h"
  description = "JWT expiry duration."
}

variable "admin_reg_number" {
  type        = string
  default     = "admin"
  description = "Admin registration number."
}

variable "app_env" {
  type        = string
  default     = "production"
  description = "Application environment."
}

variable "log_level" {
  type        = string
  default     = "INFO"
  description = "Log level."
}

variable "email_provider" {
  type        = string
  default     = "gmail"
  description = "Email provider name."
}

variable "gmail_user" {
  type        = string
  default     = ""
  description = "Gmail user for email."
}

variable "gmail_app_password" {
  type        = string
  default     = ""
  description = "Gmail app password."
}

variable "sendgrid_user" {
  type        = string
  default     = ""
  description = "SendGrid user."
}

variable "sendgrid_api_key" {
  type        = string
  default     = ""
  description = "SendGrid API key."
}

variable "resend_api_key" {
  type        = string
  default     = ""
  description = "Resend API key."
}

variable "smtp_host" {
  type        = string
  default     = ""
  description = "SMTP host."
}

variable "smtp_user" {
  type        = string
  default     = ""
  description = "SMTP user."
}

variable "smtp_password" {
  type        = string
  default     = ""
  description = "SMTP password."
}

variable "smtp_port" {
  type        = number
  default     = 587
  description = "SMTP port."
}

variable "smtp_secure" {
  type        = bool
  default     = false
  description = "SMTP secure flag."
}

variable "email_from" {
  type        = string
  default     = ""
  description = "Email from address."
}

variable "email_from_name" {
  type        = string
  default     = "Sports Event Management"
  description = "Email from display name."
}

variable "app_name" {
  type        = string
  default     = "Sports Event Management System"
  description = "Application name."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags to apply to all resources."
}

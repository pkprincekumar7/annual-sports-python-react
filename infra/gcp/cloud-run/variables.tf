variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "GCP region."
}

variable "artifact_registry_name" {
  type        = string
  default     = "annual-sports"
  description = "Artifact Registry repository name."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for all services."
}

variable "dns_zone_name" {
  type        = string
  description = "DNS zone domain (for example, your-domain.com)."
}

variable "dns_zone_resource_name" {
  type        = string
  default     = "annual-sports-zone"
  description = "Cloud DNS managed zone resource name."
}

variable "use_existing_dns_zone" {
  type        = bool
  default     = false
  description = "Use an existing Cloud DNS managed zone instead of creating one."
}

variable "dns_zone_project" {
  type        = string
  default     = ""
  description = "Project ID for existing Cloud DNS zone (defaults to project_id)."
  validation {
    condition     = !var.use_existing_dns_zone || length(trimspace(var.dns_zone_project)) > 0
    error_message = "dns_zone_project must be set when use_existing_dns_zone is true."
  }
}

variable "domain" {
  type        = string
  description = "Primary domain for the frontend."
  validation {
    condition     = can(regex("(^|\\.)" + replace(var.dns_zone_name, ".", "\\\\.") + "$", var.domain))
    error_message = "domain must match dns_zone_name or be a subdomain of it."
  }
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Optional API domain."
  validation {
    condition     = var.api_domain == "" || can(regex("(^|\\.)" + replace(var.dns_zone_name, ".", "\\\\.") + "$", var.api_domain))
    error_message = "api_domain must be empty or match dns_zone_name (or a subdomain)."
  }
}

variable "vpc_name" {
  type        = string
  default     = "annual-sports-vpc"
  description = "VPC name for VPC connector."
}

variable "subnet_name" {
  type        = string
  default     = "annual-sports-subnet"
  description = "Subnet name for VPC connector."
}

variable "subnet_cidr" {
  type        = string
  default     = "10.40.0.0/28"
  description = "Subnet CIDR for VPC connector."
}

variable "vpc_connector_name" {
  type        = string
  default     = "annual-sports-connector"
  description = "Serverless VPC connector name."
}

variable "service_cpu" {
  type        = string
  default     = "1"
  description = "CPU for each microservice."
}

variable "service_memory" {
  type        = string
  default     = "1Gi"
  description = "Memory for each microservice."
}

variable "frontend_cpu" {
  type        = string
  default     = "1"
  description = "CPU for frontend."
}

variable "frontend_memory" {
  type        = string
  default     = "512Mi"
  description = "Memory for frontend."
}

variable "api_gateway_image" {
  type        = string
  default     = "nginx:alpine"
  description = "Container image for the API gateway."
}

variable "redis_tier" {
  type        = string
  default     = "BASIC"
  description = "Memorystore Redis tier."
}

variable "redis_memory_gb" {
  type        = number
  default     = 1
  description = "Memorystore Redis memory size in GB."
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

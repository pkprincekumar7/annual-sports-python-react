variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID for ECR image URLs."
}

variable "cluster_name" {
  type        = string
  default     = "annual-sports"
  description = "ECS cluster name."
}

variable "name_prefix" {
  type        = string
  description = "Short prefix for naming shared AWS resources (include env, e.g., as-dev)."
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "VPC CIDR."
}

variable "public_subnets" {
  type        = list(string)
  description = "Public subnet CIDRs (2+)."
}

variable "private_subnets" {
  type        = list(string)
  description = "Private subnet CIDRs (2+)."
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability zones for subnets."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for all services."
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Optional API domain. Leave empty to use only the primary domain."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "Optional ACM certificate ARN for the ALB HTTPS listener (API)."
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional Route 53 hosted zone ID for API DNS record."
}

variable "redis_node_type" {
  type        = string
  default     = "cache.t3.micro"
  description = "ElastiCache Redis node type."
}

variable "redis_num_cache_nodes" {
  type        = number
  default     = 1
  description = "Number of Redis cache nodes."
}

variable "service_discovery_namespace" {
  type        = string
  default     = "annual-sports.local"
  description = "Private DNS namespace for service discovery."
}

variable "service_cpu" {
  type        = number
  default     = 512
  description = "CPU units for each service task."
}

variable "service_memory" {
  type        = number
  default     = 1024
  description = "Memory (MiB) for each service task."
}

variable "mongo_uri_secret_name" {
  type        = string
  description = "Secrets Manager secret name for MongoDB URI (shared)."
}

variable "database_names" {
  type        = map(string)
  description = "Database names per service."
}

variable "jwt_secret_name" {
  type        = string
  description = "Secrets Manager secret name for JWT secret."
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

variable "gmail_app_password_secret_name" {
  type        = string
  default     = ""
  description = "Secrets Manager secret name for Gmail app password."
}

variable "sendgrid_user" {
  type        = string
  default     = ""
  description = "SendGrid user."
}

variable "sendgrid_api_key_secret_name" {
  type        = string
  default     = ""
  description = "Secrets Manager secret name for SendGrid API key."
}

variable "resend_api_key_secret_name" {
  type        = string
  default     = ""
  description = "Secrets Manager secret name for Resend API key."
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

variable "smtp_password_secret_name" {
  type        = string
  default     = ""
  description = "Secrets Manager secret name for SMTP password."
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

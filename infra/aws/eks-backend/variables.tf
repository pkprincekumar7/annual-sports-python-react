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
  description = "EKS cluster name."
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

variable "node_instance_types" {
  type        = list(string)
  default     = ["t3.medium"]
  description = "Instance types for the EKS managed node group."
}

variable "node_desired_size" {
  type        = number
  default     = 2
  description = "Desired node count."
}

variable "node_min_size" {
  type        = number
  default     = 2
  description = "Minimum node count."
}

variable "node_max_size" {
  type        = number
  default     = 4
  description = "Maximum node count."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for all services."
}

variable "api_domain" {
  type        = string
  description = "API domain for ALB ingress (required)."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "Optional ACM certificate ARN for HTTPS on ALB."
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

variable "mongo_uri" {
  type        = string
  description = "MongoDB Atlas URI (shared)."
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

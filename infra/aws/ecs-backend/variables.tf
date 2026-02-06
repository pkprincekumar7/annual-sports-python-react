variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID for ECR image URLs."
}

variable "env" {
  type        = string
  default     = "dev"
  description = "Environment name used to derive defaults (dev, qa, stg, perf, prod)."
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "VPC CIDR."
}

variable "public_subnets" {
  type        = list(string)
  description = "Public subnet CIDRs (2+)."
  validation {
    condition     = length(var.public_subnets) >= 2
    error_message = "Provide at least 2 public subnets for multi-AZ resiliency."
  }
}

variable "private_subnets" {
  type        = list(string)
  description = "Private subnet CIDRs (2+)."
  validation {
    condition     = length(var.private_subnets) >= 2
    error_message = "Provide at least 2 private subnets for multi-AZ resiliency."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability zones for subnets."
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "Provide at least 2 availability zones for multi-AZ resiliency."
  }
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
  description = "ACM certificate ARN for the ALB HTTPS listener (API)."
  validation {
    condition     = var.acm_certificate_arn != ""
    error_message = "acm_certificate_arn is required for HTTPS-only ALB."
  }
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

variable "service_cpu_map" {
  type        = map(number)
  default     = {}
  description = "Optional per-service CPU overrides."
}

variable "service_memory_map" {
  type        = map(number)
  default     = {}
  description = "Optional per-service memory overrides."
}

variable "ulimit_nofile_soft" {
  type        = number
  default     = 65535
  description = "Soft nofile ulimit for containers."
}

variable "ulimit_nofile_hard" {
  type        = number
  default     = 65535
  description = "Hard nofile ulimit for containers."
}

variable "autoscale_min" {
  type        = number
  default     = 1
  description = "Minimum ECS desired count for autoscaling."
}

variable "autoscale_max" {
  type        = number
  default     = 4
  description = "Maximum ECS desired count for autoscaling."
}

variable "autoscale_cpu_target" {
  type        = number
  default     = 60
  description = "Target CPU utilization percentage for autoscaling."
}

variable "autoscale_memory_target" {
  type        = number
  default     = 70
  description = "Target memory utilization percentage for autoscaling."
}

variable "autoscale_alb_requests_target" {
  type        = number
  default     = 200
  description = "Target ALB requests per target for autoscaling."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "CloudWatch log retention in days."
}

variable "alarm_cpu_threshold" {
  type        = number
  default     = 80
  description = "CPU utilization alarm threshold."
}

variable "alarm_memory_threshold" {
  type        = number
  default     = 80
  description = "Memory utilization alarm threshold."
}

variable "alarm_sns_topic_arn" {
  type        = string
  default     = ""
  description = "Optional SNS topic ARN for alarm notifications."
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

variable "sendgrid_user" {
  type        = string
  default     = ""
  description = "SendGrid user."
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

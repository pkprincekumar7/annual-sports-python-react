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
  description = "Environment name used for derived defaults (dev, qa, stg, perf, prod)."
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
  validation {
    condition     = var.api_domain != ""
    error_message = "api_domain is required for ALB ingress."
  }
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS on ALB."
  validation {
    condition     = var.acm_certificate_arn != ""
    error_message = "acm_certificate_arn is required for HTTPS-only ingress."
  }
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

variable "service_cpu_request" {
  type        = string
  default     = "250m"
  description = "Default CPU request for each service."
}

variable "service_cpu_limit" {
  type        = string
  default     = "500m"
  description = "Default CPU limit for each service."
}

variable "service_memory_request" {
  type        = string
  default     = "512Mi"
  description = "Default memory request for each service."
}

variable "service_memory_limit" {
  type        = string
  default     = "1024Mi"
  description = "Default memory limit for each service."
}

variable "service_cpu_request_map" {
  type        = map(string)
  default     = {}
  description = "Optional per-service CPU request overrides."
}

variable "service_cpu_limit_map" {
  type        = map(string)
  default     = {}
  description = "Optional per-service CPU limit overrides."
}

variable "service_memory_request_map" {
  type        = map(string)
  default     = {}
  description = "Optional per-service memory request overrides."
}

variable "service_memory_limit_map" {
  type        = map(string)
  default     = {}
  description = "Optional per-service memory limit overrides."
}

variable "hpa_min_replicas" {
  type        = number
  default     = 1
  description = "Minimum replicas for HPA."
}

variable "hpa_max_replicas" {
  type        = number
  default     = 4
  description = "Maximum replicas for HPA."
}

variable "hpa_cpu_target" {
  type        = number
  default     = 60
  description = "Target CPU utilization percentage for HPA."
}

variable "hpa_memory_target" {
  type        = number
  default     = 70
  description = "Target memory utilization percentage for HPA."
}

variable "log_retention_days" {
  type        = number
  default     = 14
  description = "CloudWatch log retention in days."
}

variable "alarm_cpu_threshold" {
  type        = number
  default     = 80
  description = "Cluster CPU utilization alarm threshold."
}

variable "alarm_memory_threshold" {
  type        = number
  default     = 80
  description = "Cluster memory utilization alarm threshold."
}

variable "alarm_sns_topic_arn" {
  type        = string
  default     = ""
  description = "Optional SNS topic ARN for alarm notifications."
}

variable "keda_polling_interval" {
  type        = number
  default     = 30
  description = "KEDA polling interval in seconds."
}

variable "keda_cooldown_period" {
  type        = number
  default     = 300
  description = "KEDA cooldown period in seconds."
}

variable "alb_request_target" {
  type        = number
  default     = 200
  description = "Target ALB request count for KEDA autoscaling."
}

variable "alb_target_group_arn_suffixes" {
  type        = map(string)
  description = "Per-service ALB target group ARN suffixes for KEDA scaling."
}

variable "enable_keda_alb_scaling" {
  type        = bool
  default     = false
  description = "Enable KEDA ALB request-based scaling after ALB target groups exist."
}

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
  validation {
    condition     = length(var.env) >= 2 && length(var.env) <= 7
    error_message = "env must be 2-7 characters."
  }
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

variable "cloudfront_acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN in us-east-1 for CloudFront custom domain."
  validation {
    condition     = !var.cloudfront_enabled || var.api_domain == "" || var.cloudfront_acm_certificate_arn != ""
    error_message = "cloudfront_acm_certificate_arn must be set when api_domain is provided."
  }
}

variable "cloudfront_logs_bucket_name" {
  type        = string
  default     = ""
  description = "Optional existing S3 bucket name for CloudFront access logs."
  validation {
    condition     = var.cloudfront_enabled && var.cloudfront_logging_enabled ? var.cloudfront_logs_bucket_name != "" : true
    error_message = "cloudfront_logs_bucket_name must be set when cloudfront_logging_enabled is true."
  }
}

variable "cloudfront_logging_enabled" {
  type        = bool
  default     = true
  description = "Enable CloudFront access logging."
}

variable "cloudfront_enabled" {
  type        = bool
  default     = true
  description = "Enable CloudFront distribution for the API (disable when using global edge stack)."
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional Route 53 hosted zone ID for API DNS record."
}

variable "alb_ssl_policy" {
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  description = "SSL policy for the ALB HTTPS listener."
}

variable "alb_deletion_protection" {
  type        = bool
  default     = false
  description = "Enable deletion protection for the ALB."
}

variable "alb_access_logs_enabled" {
  type        = bool
  default     = true
  description = "Enable ALB access logs."
}

variable "alb_access_logs_bucket_name" {
  type        = string
  description = "Existing S3 bucket name for ALB access logs."
  validation {
    condition     = var.alb_access_logs_bucket_name != ""
    error_message = "alb_access_logs_bucket_name must be set to an existing bucket."
  }
}

variable "alb_access_logs_prefix" {
  type        = string
  default     = "alb"
  description = "S3 prefix for ALB access logs."
}

variable "waf_enabled" {
  type        = bool
  default     = true
  description = "Enable AWS WAF for the ALB."
}

variable "flow_logs_enabled" {
  type        = bool
  default     = true
  description = "Enable VPC flow logs."
}

variable "flow_logs_retention_days" {
  type        = number
  default     = 30
  description = "Retention in days for VPC flow logs."
}

variable "create_secrets_kms_key" {
  type        = bool
  default     = true
  description = "Create a dedicated KMS key for Secrets Manager."
}

variable "secrets_kms_key_arn" {
  type        = string
  default     = ""
  description = "Optional existing KMS key ARN for Secrets Manager."
  validation {
    condition     = var.secrets_kms_key_arn != "" || var.create_secrets_kms_key
    error_message = "Provide secrets_kms_key_arn or set create_secrets_kms_key to true."
  }
}

variable "secrets_recovery_window_in_days" {
  type        = number
  default     = 0
  description = "Recovery window in days for Secrets Manager deletion (0 = immediate)."
  validation {
    condition     = var.secrets_recovery_window_in_days >= 0 && var.secrets_recovery_window_in_days <= 30
    error_message = "secrets_recovery_window_in_days must be between 0 and 30."
  }
}

variable "ecs_tasks_egress_cidrs" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "Egress CIDR blocks for ECS tasks."
}

variable "redis_node_type" {
  type        = string
  default     = "cache.t3.micro"
  description = "ElastiCache Redis node type."
}

variable "redis_num_cache_nodes" {
  type        = number
  default     = 2
  description = "Number of Redis cache nodes in the replication group."
  validation {
    condition     = var.redis_num_cache_nodes >= 1
    error_message = "redis_num_cache_nodes must be at least 1."
  }
}

variable "redis_transit_encryption_enabled" {
  type        = bool
  default     = true
  description = "Enable in-transit encryption for Redis."
}

variable "redis_at_rest_encryption_enabled" {
  type        = bool
  default     = true
  description = "Enable at-rest encryption for Redis."
}


variable "redis_multi_az_enabled" {
  type        = bool
  default     = true
  description = "Enable Multi-AZ for Redis replication group."
}

variable "redis_snapshot_retention_limit" {
  type        = number
  default     = 7
  description = "Number of days to retain Redis snapshots."
}

variable "redis_snapshot_window" {
  type        = string
  default     = "03:00-04:00"
  description = "Daily snapshot window for Redis."
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

variable "app_s3_bucket_name" {
  type        = string
  default     = ""
  description = "Global app S3 bucket name shared across regions (managed outside this stack)."
  validation {
    condition     = var.app_s3_bucket_name != ""
    error_message = "app_s3_bucket_name must be set."
  }
}

variable "redis_port" {
  type        = number
  default     = 6379
  description = "Redis port."
}

variable "app_prefix" {
  type        = string
  default     = "as"
  description = "Short application prefix used in resource names."
  validation {
    condition     = length(var.app_prefix) >= 2 && length(var.app_prefix) <= 5
    error_message = "app_prefix must be 2-5 characters."
  }
}

variable "services" {
  type = map(object({
    port                = number
    health_path         = string
    tg_suffix           = string
    redis_db_index      = number
    db_suffix           = string
    url_env_name        = string
    path_patterns       = list(string)
  }))
  description = "Service definitions (port, health, TG suffix, DB suffix, Redis index, URL env name, path patterns)."
  validation {
    condition     = length(var.services) > 0
    error_message = "services must define at least one service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.port])) == length(var.services)
    error_message = "services.port must be unique per service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.tg_suffix])) == length(var.services)
    error_message = "services.tg_suffix must be unique per service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.redis_db_index])) == length(var.services)
    error_message = "services.redis_db_index must be unique per service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.db_suffix])) == length(var.services)
    error_message = "services.db_suffix must be unique per service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.url_env_name])) == length(var.services)
    error_message = "services.url_env_name must be unique per service."
  }
  validation {
    condition     = alltrue([for name, _ in var.services : length(replace(name, "-service", "")) >= 2 && length(replace(name, "-service", "")) <= 17])
    error_message = "service name (excluding \"-service\") must be 2-17 characters."
  }
  validation {
    condition     = alltrue([for svc in values(var.services) : length(svc.path_patterns) > 0])
    error_message = "services.path_patterns must contain at least one value per service."
  }
  validation {
    condition     = alltrue([for svc in values(var.services) : length(distinct(svc.path_patterns)) == length(svc.path_patterns)])
    error_message = "services.path_patterns must be unique within each service."
  }
  validation {
    condition     = alltrue([for svc in values(var.services) : length(var.app_prefix) + 1 + length(var.env) + 1 + length(svc.tg_suffix) <= 32])
    error_message = "services.tg_suffix is too long for ALB target group name."
  }
}

variable "autoscale_min" {
  type        = number
  default     = 1
  description = "Minimum ECS desired count for autoscaling."
}

variable "force_new_deployment" {
  type        = bool
  default     = false
  description = "Force new ECS deployment on every apply."
}

variable "deployment_minimum_healthy_percent" {
  type        = number
  default     = 100
  description = "Minimum healthy percent during ECS deployments."
}

variable "deployment_maximum_percent" {
  type        = number
  default     = 200
  description = "Maximum percent during ECS deployments."
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

variable "autoscale_scale_in_cooldown" {
  type        = number
  default     = 120
  description = "Cooldown period (seconds) after scaling in."
}

variable "autoscale_scale_out_cooldown" {
  type        = number
  default     = 60
  description = "Cooldown period (seconds) after scaling out."
}

variable "log_retention_days" {
  type        = number
  default     = 30
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

variable "alarm_alb_5xx_threshold" {
  type        = number
  default     = 10
  description = "ALB 5xx error count alarm threshold."
}

variable "alarm_target_5xx_threshold" {
  type        = number
  default     = 5
  description = "Target 5xx error count alarm threshold."
}

variable "alarm_unhealthy_host_threshold" {
  type        = number
  default     = 1
  description = "Unhealthy host count alarm threshold."
}

variable "alarm_target_response_time_threshold" {
  type        = number
  default     = 2
  description = "Target response time (seconds) alarm threshold."
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

variable "log_level" {
  type        = string
  default     = "INFO"
  description = "Log level."
}

variable "apigw_cors_allowed_origins" {
  type        = list(string)
  default     = ["*"]
  description = "CORS allowed origins for API Gateway (HTTP API)."
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

variable "redis_auth_token_bootstrap" {
  type        = string
  default     = ""
  description = "Optional sample Redis auth token used by CI to initialize Secrets Manager when empty."
}

variable "app_name" {
  type        = string
  default     = "Sports Event Management System"
  description = "Application name."
}

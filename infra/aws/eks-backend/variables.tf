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
  validation {
    condition     = length(var.env) >= 2 && length(var.env) <= 7
    error_message = "env must be 2-7 characters."
  }
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

variable "enable_compute_node_group" {
  type        = bool
  default     = false
  description = "Enable a separate compute-optimized node group for workload isolation. Set desired_size > 0 when enabled."
}

variable "compute_node_instance_types" {
  type        = list(string)
  default     = ["c5.large"]
  description = "Instance types for the compute node group (compute-optimized)."
}

variable "compute_node_min_size" {
  type        = number
  default     = 0
  description = "Minimum node count for compute node group."
}

variable "compute_node_desired_size" {
  type        = number
  default     = 0
  description = "Desired node count for compute node group."
}

variable "compute_node_max_size" {
  type        = number
  default     = 4
  description = "Maximum node count for compute node group."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for all services."
}

variable "services" {
  type = map(object({
    port           = number
    health_path    = string
    tg_suffix      = string
    redis_db_index = number
    db_suffix      = string
    url_env_name   = string
    path_patterns  = list(string)
  }))
  description = "Service definitions (port, health, TG suffix, DB suffix, Redis index, URL env name, path patterns). Same structure as ECS for tfvars consistency."
  validation {
    condition     = length(var.services) > 0
    error_message = "services must define at least one service."
  }
  validation {
    condition     = length(distinct([for svc in values(var.services) : svc.port])) == length(var.services)
    error_message = "services.port must be unique per service."
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
    condition     = alltrue([for svc in values(var.services) : length(svc.path_patterns) > 0])
    error_message = "services.path_patterns must contain at least one value per service."
  }
  default = {
    "identity-service" = {
      port           = 8001
      health_path    = "/health"
      tg_suffix      = "id"
      redis_db_index = 0
      db_suffix      = "identity"
      url_env_name   = "IDENTITY_URL"
      path_patterns  = ["/identities*"]
    }
    "enrollment-service" = {
      port           = 8002
      health_path    = "/health"
      tg_suffix      = "enr"
      redis_db_index = 1
      db_suffix      = "enrollment"
      url_env_name   = "ENROLLMENT_URL"
      path_patterns  = ["/enrollments*"]
    }
    "department-service" = {
      port           = 8003
      health_path    = "/health"
      tg_suffix      = "dep"
      redis_db_index = 2
      db_suffix      = "department"
      url_env_name   = "DEPARTMENT_URL"
      path_patterns  = ["/departments*"]
    }
    "sports-part-service" = {
      port           = 8004
      health_path    = "/health"
      tg_suffix      = "sp"
      redis_db_index = 3
      db_suffix      = "sports-part"
      url_env_name   = "SPORTS_PARTICIPATION_URL"
      path_patterns  = ["/sports-participations*", "/sports-parts*"]
    }
    "event-config-service" = {
      port           = 8005
      health_path    = "/health"
      tg_suffix      = "evt"
      redis_db_index = 4
      db_suffix      = "event-config"
      url_env_name   = "EVENT_CONFIGURATION_URL"
      path_patterns  = ["/event-configurations*", "/event-configs*"]
    }
    "scheduling-service" = {
      port           = 8006
      health_path    = "/health"
      tg_suffix      = "sch"
      redis_db_index = 5
      db_suffix      = "scheduling"
      url_env_name   = "SCHEDULING_URL"
      path_patterns  = ["/schedulings*"]
    }
    "scoring-service" = {
      port           = 8007
      health_path    = "/health"
      tg_suffix      = "sco"
      redis_db_index = 6
      db_suffix      = "scoring"
      url_env_name   = "SCORING_URL"
      path_patterns  = ["/scorings*"]
    }
    "reporting-service" = {
      port           = 8008
      health_path    = "/health"
      tg_suffix      = "rep"
      redis_db_index = 7
      db_suffix      = "reporting"
      url_env_name   = "REPORTING_URL"
      path_patterns  = ["/reportings*"]
    }
  }
}

variable "api_domain" {
  type        = string
  default     = ""
  description = "Optional API domain. When cloudfront_enabled, used for CloudFront alias. When disabled, used for ALB Ingress host-based routing."
}

variable "cloudfront_enabled" {
  type        = bool
  default     = true
  description = "Enable Private ALB → API Gateway → CloudFront → WAF (industry best practice). When false, use direct internet-facing ALB."
}

variable "cloudfront_acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN in us-east-1 for CloudFront custom domain."
  validation {
    condition     = !var.cloudfront_enabled || var.api_domain == "" || var.cloudfront_acm_certificate_arn != ""
    error_message = "cloudfront_acm_certificate_arn must be set when cloudfront_enabled and api_domain are set."
  }
}

variable "cloudfront_logs_bucket_name" {
  type        = string
  default     = ""
  description = "Optional existing S3 bucket name for CloudFront access logs. Required when cloudfront_logging_enabled is true."
}

variable "cloudfront_logging_enabled" {
  type        = bool
  default     = true
  description = "Enable CloudFront access logging."
}

variable "waf_enabled" {
  type        = bool
  default     = true
  description = "Enable AWS WAF for CloudFront (when cloudfront_enabled)."
}

variable "apigw_cors_allowed_origins" {
  type        = list(string)
  default     = ["*"]
  description = "CORS allowed origins for API Gateway (HTTP API)."
}

variable "route53_zone_id" {
  type        = string
  default     = ""
  description = "Optional Route 53 hosted zone ID for API DNS record."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN for HTTPS on ALB. Not required when cloudfront_enabled (TLS at CloudFront)."
  validation {
    condition     = var.api_domain == "" || var.acm_certificate_arn != "" || var.cloudfront_enabled
    error_message = "acm_certificate_arn is required when api_domain is set and cloudfront_enabled is false."
  }
}

variable "app_s3_bucket_name" {
  type        = string
  default     = ""
  description = "Global app S3 bucket name shared across regions (managed outside this stack). Required for app bucket IAM grants."
}

variable "alb_access_logs_bucket_name" {
  type        = string
  default     = ""
  description = "Optional existing S3 bucket name for ALB access logs."
}

variable "alb_access_logs_enabled" {
  type        = bool
  default     = true
  description = "Enable ALB access logs."
}

variable "alb_access_logs_prefix" {
  type        = string
  default     = "alb"
  description = "S3 prefix for ALB access logs."
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

variable "redis_port" {
  type        = number
  default     = 6379
  description = "Redis port."
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

variable "redis_auth_token_bootstrap" {
  type        = string
  default     = ""
  description = "Optional sample Redis auth token used by CI to initialize Secrets Manager when empty."
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

variable "enable_alb_alarms" {
  type        = bool
  default     = true
  description = "Enable CloudWatch alarms for ALB (5xx, target 5xx, unhealthy hosts, response time)."
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

variable "alb_deletion_protection" {
  type        = bool
  default     = false
  description = "Enable deletion protection for the ALB. Set to false before terraform destroy."
}

variable "alb_ssl_policy" {
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  description = "SSL policy for the ALB HTTPS listener. Used when cloudfront_enabled is false and acm_certificate_arn is set."
}

variable "deployment_max_surge" {
  type        = string
  default     = "25%"
  description = "Maximum number of pods that can be created over the desired number (Deployment strategy)."
}

variable "deployment_max_unavailable" {
  type        = string
  default     = "0"
  description = "Maximum number of pods that can be unavailable during update (Deployment strategy)."
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
  default     = {}
  description = "Per-service ALB target group ARN suffixes (format: targetgroup/name/id). Used for KEDA scaling and ALB per-service alarms. Fetch after ALB creation."
}

variable "enable_keda_alb_scaling" {
  type        = bool
  default     = true
  description = "Enable KEDA scaling (CPU, memory, and ALB requests when alb_target_group_arn_suffixes is set). Set alb_target_group_arn_suffixes after first apply for ALB-based scaling."
}

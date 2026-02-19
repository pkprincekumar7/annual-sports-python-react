variable "primary_region" {
  type        = string
  default     = "us-east-1"
  description = "Primary region for the Redis global datastore."
  validation {
    condition     = var.primary_region == "us-east-1"
    error_message = "primary_region must be us-east-1 for this stack."
  }
}

variable "app_prefix" {
  type        = string
  description = "Application prefix."
}

variable "env" {
  type        = string
  description = "Environment name (dev, qa, stg, perf, prod)."
}

variable "primary_vpc_id" {
  type        = string
  description = "VPC ID for the primary region."
}

variable "primary_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the primary region."
  validation {
    condition     = length(var.primary_subnet_ids) > 0
    error_message = "primary_subnet_ids must include at least one subnet ID."
  }
}

variable "primary_ecs_sg_id" {
  type        = string
  description = "ECS tasks security group ID for the primary region."
}

variable "enable_eu_west_1" {
  type        = bool
  default     = true
  description = "Enable eu-west-1 secondary."
}

variable "eu_west_1_vpc_id" {
  type        = string
  default     = ""
  description = "VPC ID for eu-west-1."
  validation {
    condition     = !var.enable_eu_west_1 || var.eu_west_1_vpc_id != ""
    error_message = "eu_west_1_vpc_id must be set when enable_eu_west_1 is true."
  }
}

variable "eu_west_1_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnet IDs for eu-west-1."
  validation {
    condition     = !var.enable_eu_west_1 || length(var.eu_west_1_subnet_ids) > 0
    error_message = "eu_west_1_subnet_ids must be set when enable_eu_west_1 is true."
  }
}

variable "eu_west_1_ecs_sg_id" {
  type        = string
  default     = ""
  description = "ECS tasks security group ID for eu-west-1."
  validation {
    condition     = !var.enable_eu_west_1 || var.eu_west_1_ecs_sg_id != ""
    error_message = "eu_west_1_ecs_sg_id must be set when enable_eu_west_1 is true."
  }
}

variable "enable_ap_southeast_1" {
  type        = bool
  default     = true
  description = "Enable ap-southeast-1 secondary."
}

variable "ap_southeast_1_vpc_id" {
  type        = string
  default     = ""
  description = "VPC ID for ap-southeast-1."
  validation {
    condition     = !var.enable_ap_southeast_1 || var.ap_southeast_1_vpc_id != ""
    error_message = "ap_southeast_1_vpc_id must be set when enable_ap_southeast_1 is true."
  }
}

variable "ap_southeast_1_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnet IDs for ap-southeast-1."
  validation {
    condition     = !var.enable_ap_southeast_1 || length(var.ap_southeast_1_subnet_ids) > 0
    error_message = "ap_southeast_1_subnet_ids must be set when enable_ap_southeast_1 is true."
  }
}

variable "ap_southeast_1_ecs_sg_id" {
  type        = string
  default     = ""
  description = "ECS tasks security group ID for ap-southeast-1."
  validation {
    condition     = !var.enable_ap_southeast_1 || var.ap_southeast_1_ecs_sg_id != ""
    error_message = "ap_southeast_1_ecs_sg_id must be set when enable_ap_southeast_1 is true."
  }
}

variable "redis_node_type" {
  type        = string
  default     = "cache.t4g.small"
  description = "Redis node type."
}

variable "redis_num_cache_nodes" {
  type        = number
  default     = 1
  description = "Number of cache nodes per replication group."
  validation {
    condition     = var.redis_num_cache_nodes >= 1
    error_message = "redis_num_cache_nodes must be at least 1."
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
  description = "Enable Redis transit encryption."
}

variable "redis_at_rest_encryption_enabled" {
  type        = bool
  default     = true
  description = "Enable Redis at-rest encryption."
}

variable "redis_auth_token" {
  type        = string
  default     = ""
  description = "Redis auth token (must match Secrets Manager values in regional stacks)."
  sensitive   = true
  validation {
    condition     = !var.redis_transit_encryption_enabled || var.redis_auth_token != ""
    error_message = "redis_auth_token must be set when redis_transit_encryption_enabled is true."
  }
}

variable "redis_snapshot_retention_limit" {
  type        = number
  default     = 7
  description = "Snapshot retention limit."
}

variable "redis_snapshot_window" {
  type        = string
  default     = "03:00-04:00"
  description = "Snapshot window."
}

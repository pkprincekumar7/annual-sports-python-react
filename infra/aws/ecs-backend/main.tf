provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  services  = var.services
  ecr_repos = keys(local.services)
  image_prefix = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  name_prefix = "${var.app_prefix}-${var.env}"
  cluster_name = "${local.name_prefix}-cluster"
  service_discovery_namespace = "${var.app_prefix}.${var.env}.local"
  sorted_service_keys = sort(keys(local.services))
  alb_name    = "${local.name_prefix}-alb"
  ecs_tasks_name = "${local.name_prefix}-ecs-tasks"
  redis_name     = "${local.name_prefix}-redis"
  alb_logs_bucket_name = var.alb_access_logs_bucket_name
  secrets_kms_key_arn  = var.secrets_kms_key_arn != "" ? var.secrets_kms_key_arn : (var.create_secrets_kms_key ? aws_kms_key.secrets[0].arn : null)
  tg_names = {
    for name, svc in local.services :
    name => svc.tg_suffix
  }
  has_route53_zone     = var.route53_zone_id != ""

  service_url_env = {
    for name, svc in local.services :
    svc.url_env_name => "http://${name}.${local.service_discovery_namespace}:${svc.port}"
  }

  common_env = {
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.env
    LOG_LEVEL        = var.log_level
    EMAIL_PROVIDER  = var.email_provider
    GMAIL_USER      = var.gmail_user
    SENDGRID_USER   = var.sendgrid_user
    SMTP_HOST       = var.smtp_host
    SMTP_USER       = var.smtp_user
    SMTP_PORT       = tostring(var.smtp_port)
    SMTP_SECURE     = tostring(var.smtp_secure)
    EMAIL_FROM      = var.email_from
    EMAIL_FROM_NAME = var.email_from_name
    APP_NAME        = var.app_name
  }

  database_names = {
    for name, svc in local.services :
    name => "${local.name_prefix}-${svc.db_suffix}"
  }

  mongo_env = {
    for name, _ in local.services :
    name => {
      DATABASE_NAME = local.database_names[name]
    }
  }

  redis_env = {
    for name, svc in local.services :
    name => {
      REDIS_URL = "${local.redis_base_url}/${svc.redis_db_index}"
    }
  }

  service_env = {
    for name, svc in local.services :
    name => merge(
      local.service_url_env,
      local.common_env,
      local.mongo_env[name],
      local.redis_env[name]
    )
  }

  secret_names = {
    jwt_secret         = "${local.name_prefix}-jwt"
    mongo_uri          = "${local.name_prefix}-mongo-uri"
    redis_auth_token   = "${local.name_prefix}-redis-auth-token"
    gmail_app_password = "${local.name_prefix}-gmail-app-password"
    sendgrid_api_key   = "${local.name_prefix}-sendgrid-api-key"
    resend_api_key     = "${local.name_prefix}-resend-api-key"
    smtp_password      = "${local.name_prefix}-smtp-password"
  }

  base_secret_env = [
    {
      name      = "JWT_SECRET"
      valueFrom = aws_secretsmanager_secret.jwt_secret.arn
    },
    {
      name      = "GMAIL_APP_PASSWORD"
      valueFrom = aws_secretsmanager_secret.gmail_app_password.arn
    },
    {
      name      = "SENDGRID_API_KEY"
      valueFrom = aws_secretsmanager_secret.sendgrid_api_key.arn
    },
    {
      name      = "RESEND_API_KEY"
      valueFrom = aws_secretsmanager_secret.resend_api_key.arn
    },
    {
      name      = "SMTP_PASSWORD"
      valueFrom = aws_secretsmanager_secret.smtp_password.arn
    }
  ]

  mongo_secret_env = [
    {
      name      = "MONGODB_URI"
      valueFrom = aws_secretsmanager_secret.mongo_uri.arn
    }
  ]

  service_secrets = {
    for name, svc in local.services :
    name => concat(
      local.base_secret_env,
      local.mongo_secret_env
    )
  }

  redis_multi_az_enabled = var.redis_num_cache_nodes > 1 ? var.redis_multi_az_enabled : false
  redis_automatic_failover_enabled = var.redis_num_cache_nodes > 1 ? var.redis_multi_az_enabled : false
  redis_auth_token = var.redis_transit_encryption_enabled ? data.aws_secretsmanager_secret_version.redis_auth_token[0].secret_string : ""
  redis_scheme   = var.redis_transit_encryption_enabled ? "rediss" : "redis"
  redis_auth     = local.redis_auth_token != "" ? ":${urlencode(local.redis_auth_token)}@" : ""
  redis_base_url = "${local.redis_scheme}://${local.redis_auth}${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"

  service_cpu = {
    for name, _ in local.services :
    name => lookup(var.service_cpu_map, name, var.service_cpu)
  }

  service_memory = {
    for name, _ in local.services :
    name => lookup(var.service_memory_map, name, var.service_memory)
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

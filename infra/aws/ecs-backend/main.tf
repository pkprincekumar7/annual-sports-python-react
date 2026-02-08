provider "aws" {
  region = var.aws_region
}

locals {
  services = {
    "identity-service" = { port = 8001, health_path = "/health" }
    "enrollment-service" = { port = 8002, health_path = "/health" }
    "department-service" = { port = 8003, health_path = "/health" }
    "sports-participation-service" = { port = 8004, health_path = "/health" }
    "event-configuration-service" = { port = 8005, health_path = "/health" }
    "scheduling-service" = { port = 8006, health_path = "/health" }
    "scoring-service" = { port = 8007, health_path = "/health" }
    "reporting-service" = { port = 8008, health_path = "/health" }
  }

  redis_db_index = {
    "identity-service"             = 0
    "enrollment-service"           = 1
    "department-service"           = 2
    "sports-participation-service" = 3
    "event-configuration-service"  = 4
    "scheduling-service"           = 5
    "scoring-service"              = 6
    "reporting-service"            = 7
  }

  ecr_repos = keys(local.services)
  image_prefix = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  name_prefix = "as-${var.env}"
  cluster_name = "annual-sports-${var.env}"
  service_discovery_namespace = "annual-sports.${var.env}.local"
  alb_name    = "${local.name_prefix}-alb"
  ecs_tasks_name = "${local.name_prefix}-ecs-tasks"
  redis_name     = "${local.name_prefix}-redis"
  alb_logs_bucket_name = var.alb_access_logs_bucket_name
  secrets_kms_key_arn  = var.secrets_kms_key_arn != "" ? var.secrets_kms_key_arn : (var.create_secrets_kms_key ? aws_kms_key.secrets[0].arn : null)
  tg_names = {
    "identity-service"             = "id"
    "enrollment-service"           = "enr"
    "department-service"           = "dep"
    "sports-participation-service" = "sp"
    "event-configuration-service"  = "evt"
    "scheduling-service"           = "sch"
    "scoring-service"              = "sco"
    "reporting-service"            = "rep"
  }
  has_route53_zone     = var.route53_zone_id != ""

  service_url_env = {
    IDENTITY_URL             = "http://identity-service.${local.service_discovery_namespace}:8001"
    ENROLLMENT_URL           = "http://enrollment-service.${local.service_discovery_namespace}:8002"
    DEPARTMENT_URL           = "http://department-service.${local.service_discovery_namespace}:8003"
    SPORTS_PARTICIPATION_URL = "http://sports-participation-service.${local.service_discovery_namespace}:8004"
    EVENT_CONFIGURATION_URL  = "http://event-configuration-service.${local.service_discovery_namespace}:8005"
    SCHEDULING_URL           = "http://scheduling-service.${local.service_discovery_namespace}:8006"
    SCORING_URL              = "http://scoring-service.${local.service_discovery_namespace}:8007"
    REPORTING_URL            = "http://reporting-service.${local.service_discovery_namespace}:8008"
  }

  common_env = {
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.app_env
    LOG_LEVEL        = var.log_level
  }

  database_names = {
    "identity-service"             = "${local.name_prefix}-identity"
    "enrollment-service"           = "${local.name_prefix}-enrollment"
    "department-service"           = "${local.name_prefix}-department"
    "sports-participation-service" = "${local.name_prefix}-sports-part"
    "event-configuration-service"  = "${local.name_prefix}-event-config"
    "scheduling-service"           = "${local.name_prefix}-scheduling"
    "scoring-service"              = "${local.name_prefix}-scoring"
    "reporting-service"            = "${local.name_prefix}-reporting"
  }

  mongo_env = {
    for name, _ in local.services :
    name => {
      DATABASE_NAME = local.database_names[name]
    }
  }

  redis_env = {
    for name, index in local.redis_db_index :
    name => {
      REDIS_URL = "${local.redis_base_url}/${index}"
    }
  }

  identity_env = {
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

  service_env = {
    for name, _ in local.services :
    name => merge(
      local.service_url_env,
      local.common_env,
      local.mongo_env[name],
      local.redis_env[name],
      name == "identity-service" ? local.identity_env : {}
    )
  }

  secret_names = {
    jwt_secret         = "${local.name_prefix}-jwt"
    mongo_uri          = "${local.name_prefix}-mongo-uri"
    gmail_app_password = "${local.name_prefix}-gmail-app-password"
    sendgrid_api_key   = "${local.name_prefix}-sendgrid-api-key"
    resend_api_key     = "${local.name_prefix}-resend-api-key"
    smtp_password      = "${local.name_prefix}-smtp-password"
  }

  base_secret_env = [
    {
      name      = "JWT_SECRET"
      valueFrom = aws_secretsmanager_secret.jwt_secret.arn
    }
  ]

  mongo_secret_env = [
    {
      name      = "MONGODB_URI"
      valueFrom = aws_secretsmanager_secret.mongo_uri.arn
    }
  ]

  identity_secret_env = [
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

  service_secrets = {
    for name, _ in local.services :
    name => concat(
      local.base_secret_env,
      local.mongo_secret_env,
      name == "identity-service" ? local.identity_secret_env : []
    )
  }

  redis_multi_az_enabled = var.redis_num_cache_nodes > 1 ? var.redis_multi_az_enabled : false
  redis_automatic_failover_enabled = var.redis_num_cache_nodes > 1 ? var.redis_multi_az_enabled : false
  redis_scheme   = var.redis_transit_encryption_enabled ? "rediss" : "redis"
  redis_auth     = var.redis_auth_token != "" ? ":${urlencode(var.redis_auth_token)}@" : ""
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

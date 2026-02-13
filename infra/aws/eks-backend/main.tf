provider "aws" {
  region = var.aws_region
}

locals {
  services = {
    "identity-service" = { port = 8001 }
    "enrollment-service" = { port = 8002 }
    "department-service" = { port = 8003 }
    "sports-part-service" = { port = 8004 }
    "event-config-service" = { port = 8005 }
    "scheduling-service" = { port = 8006 }
    "scoring-service" = { port = 8007 }
    "reporting-service" = { port = 8008 }
  }

  redis_db_index = {
    "identity-service"             = 0
    "enrollment-service"           = 1
    "department-service"           = 2
    "sports-part-service" = 3
    "event-config-service"  = 4
    "scheduling-service"           = 5
    "scoring-service"              = 6
    "reporting-service"            = 7
  }

  ecr_repos = keys(local.services)

  service_url_env = {
    IDENTITY_URL             = "http://identity-service:8001"
    ENROLLMENT_URL           = "http://enrollment-service:8002"
    DEPARTMENT_URL           = "http://department-service:8003"
    SPORTS_PARTICIPATION_URL = "http://sports-part-service:8004"
    EVENT_CONFIGURATION_URL  = "http://event-config-service:8005"
    SCHEDULING_URL           = "http://scheduling-service:8006"
    SCORING_URL              = "http://scoring-service:8007"
    REPORTING_URL            = "http://reporting-service:8008"
  }

  common_env = {
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.app_env
    LOG_LEVEL        = var.log_level
  }

  name_prefix  = "as-${var.env}"
  cluster_name = "annual-sports-${var.env}"

  secret_names = {
    jwt_secret         = "${local.name_prefix}-jwt"
    mongo_uri          = "${local.name_prefix}-mongo-uri"
    gmail_app_password = "${local.name_prefix}-gmail-app-password"
    sendgrid_api_key   = "${local.name_prefix}-sendgrid-api-key"
    resend_api_key     = "${local.name_prefix}-resend-api-key"
    smtp_password      = "${local.name_prefix}-smtp-password"
  }

  database_names = {
    "identity-service"             = "${local.name_prefix}-identity"
    "enrollment-service"           = "${local.name_prefix}-enrollment"
    "department-service"           = "${local.name_prefix}-department"
    "sports-part-service" = "${local.name_prefix}-sports-part"
    "event-config-service"  = "${local.name_prefix}-event-config"
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

  base_secret_data = [
    { key = "JWT_SECRET",   secret_name = local.secret_names.jwt_secret },
    { key = "MONGODB_URI",  secret_name = local.secret_names.mongo_uri }
  ]

  identity_secret_data = [
    { key = "GMAIL_APP_PASSWORD", secret_name = local.secret_names.gmail_app_password },
    { key = "SENDGRID_API_KEY",   secret_name = local.secret_names.sendgrid_api_key },
    { key = "RESEND_API_KEY",     secret_name = local.secret_names.resend_api_key },
    { key = "SMTP_PASSWORD",      secret_name = local.secret_names.smtp_password }
  ]

  service_secret_data = {
    for name, _ in local.services :
    name => concat(
      local.base_secret_data,
      name == "identity-service" ? local.identity_secret_data : []
    )
  }

  service_resources = {
    for name, _ in local.services :
    name => {
      cpu_request    = lookup(var.service_cpu_request_map, name, var.service_cpu_request)
      cpu_limit      = lookup(var.service_cpu_limit_map, name, var.service_cpu_limit)
      memory_request = lookup(var.service_memory_request_map, name, var.service_memory_request)
      memory_limit   = lookup(var.service_memory_limit_map, name, var.service_memory_limit)
    }
  }

  alb_name = "${local.name_prefix}-alb"

  image_prefix = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  redis_base_url = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}"
  redis_url      = local.redis_base_url

  redis_name      = "${local.name_prefix}-redis"
  alb_controller_name = "${local.name_prefix}-alb-controller"

  api_paths = [
    { path = "/identities", service = "identity-service", port = 8001 },
    { path = "/enrollments", service = "enrollment-service", port = 8002 },
    { path = "/departments", service = "department-service", port = 8003 },
    { path = "/sports-participations", service = "sports-part-service", port = 8004 },
    { path = "/event-configurations", service = "event-config-service", port = 8005 },
    { path = "/schedulings", service = "scheduling-service", port = 8006 },
    { path = "/scorings", service = "scoring-service", port = 8007 },
    { path = "/reportings", service = "reporting-service", port = 8008 }
  ]

  ingress_hosts = {
    for host in compact([var.api_domain]) :
    host => host
  }

  alb_annotations = {
    "kubernetes.io/ingress.class"            = "alb"
    "alb.ingress.kubernetes.io/scheme"       = "internet-facing"
    "alb.ingress.kubernetes.io/target-type"  = "ip"
    "alb.ingress.kubernetes.io/load-balancer-name" = local.alb_name
    "alb.ingress.kubernetes.io/certificate-arn" = var.acm_certificate_arn
    "alb.ingress.kubernetes.io/listen-ports"    = "[{\"HTTP\":80},{\"HTTPS\":443}]"
    "alb.ingress.kubernetes.io/ssl-redirect"    = "443"
    "alb.ingress.kubernetes.io/healthcheck-path" = "/health"
  }
}

provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  services = var.services

  sorted_service_keys = sort(keys(local.services))

  ecr_repos = keys(local.services)

  service_url_env = {
    for name, svc in local.services :
    svc.url_env_name => "http://${name}:${svc.port}"
  }

  common_env = {
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.app_env
    LOG_LEVEL        = var.log_level
  }

  name_prefix         = "${var.app_prefix}-${var.env}"
  iam_name_prefix     = "${local.name_prefix}-${var.aws_region}"
  cluster_name        = "annual-sports-${var.env}"
  secrets_kms_key_arn = var.secrets_kms_key_arn != "" ? var.secrets_kms_key_arn : (var.create_secrets_kms_key ? aws_kms_key.secrets[0].arn : null)

  secret_names = {
    jwt_secret         = "${local.name_prefix}-jwt"
    mongo_uri          = "${local.name_prefix}-mongo-uri"
    redis_auth_token   = "${local.name_prefix}-redis-auth-token"
    gmail_app_password = "${local.name_prefix}-gmail-app-password"
    sendgrid_api_key   = "${local.name_prefix}-sendgrid-api-key"
    resend_api_key     = "${local.name_prefix}-resend-api-key"
    smtp_password      = "${local.name_prefix}-smtp-password"
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

  redis_auth_token = var.redis_transit_encryption_enabled ? data.aws_secretsmanager_secret_version.redis_auth_token[0].secret_string : ""
  redis_scheme     = var.redis_transit_encryption_enabled ? "rediss" : "redis"
  redis_auth       = local.redis_auth_token != "" ? ":${urlencode(local.redis_auth_token)}@" : ""
  redis_host       = aws_elasticache_replication_group.redis.primary_endpoint_address
  redis_base_url   = "${local.redis_scheme}://${local.redis_auth}${local.redis_host}:${var.redis_port}"
  redis_url        = local.redis_base_url

  redis_name           = "${local.name_prefix}-redis"
  alb_controller_name  = "${local.name_prefix}-alb-controller"

  healthcheck_path = length(local.services) > 0 ? values(local.services)[0].health_path : "/health"

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  alb_load_balancer_attrs = join(",", compact(concat(
    var.alb_access_logs_enabled && var.alb_access_logs_bucket_name != "" ? ["access_logs.s3.enabled=true", "access_logs.s3.bucket=${var.alb_access_logs_bucket_name}", "access_logs.s3.prefix=${var.alb_access_logs_prefix}"] : [],
    var.alb_deletion_protection ? ["deletion_protection.enabled=true"] : []
  )))

  # Derive from services.path_patterns; strip * for Kubernetes Ingress Prefix path type
  api_paths = flatten([
    for name, svc in local.services : [
      for p in svc.path_patterns : {
        path    = replace(p, "*", "")
        service = name
        port    = svc.port
      }
    ]
  ])

  # When cloudfront_enabled: use empty host so ALB matches requests from API Gateway (any Host header)
  # When cloudfront disabled: use api_domain if set, else empty host (matches ALB hostname or any)
  ingress_hosts = var.cloudfront_enabled ? { "" = "" } : (var.api_domain != "" ? { (var.api_domain) = var.api_domain } : { "" = "" })

  # When cloudfront_enabled: private ALB (API Gateway VPC Link connects); HTTP only (TLS at CloudFront)
  # When cloudfront disabled: internet-facing ALB with optional HTTPS
  alb_annotations = merge(
    {
      "kubernetes.io/ingress.class"                  = "alb"
      "alb.ingress.kubernetes.io/scheme"             = var.cloudfront_enabled ? "internal" : "internet-facing"
      "alb.ingress.kubernetes.io/target-type"        = "ip"
      "alb.ingress.kubernetes.io/load-balancer-name" = local.alb_name
      "alb.ingress.kubernetes.io/healthcheck-path"   = local.healthcheck_path
    },
    var.cloudfront_enabled ? {
      "alb.ingress.kubernetes.io/listen-ports" = "[{\"HTTP\":80}]"
    } : (var.acm_certificate_arn != "" ? {
      "alb.ingress.kubernetes.io/certificate-arn" = var.acm_certificate_arn
      "alb.ingress.kubernetes.io/listen-ports"   = "[{\"HTTP\":80},{\"HTTPS\":443}]"
      "alb.ingress.kubernetes.io/ssl-redirect"   = "443"
      "alb.ingress.kubernetes.io/ssl-policy"    = var.alb_ssl_policy
    } : {
      "alb.ingress.kubernetes.io/listen-ports" = "[{\"HTTP\":80}]"
    }),
    length(local.alb_load_balancer_attrs) > 0 ? {
      "alb.ingress.kubernetes.io/load-balancer-attributes" = local.alb_load_balancer_attrs
    } : {}
  )
}

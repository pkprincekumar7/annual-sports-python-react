locals {
  services = {
    "identity-service"             = { port = 8001 }
    "enrollment-service"           = { port = 8002 }
    "department-service"           = { port = 8003 }
    "sports-participation-service" = { port = 8004 }
    "event-configuration-service"  = { port = 8005 }
    "scheduling-service"           = { port = 8006 }
    "scoring-service"              = { port = 8007 }
    "reporting-service"            = { port = 8008 }
  }

  service_host_suffix = azurerm_container_app_environment.env.default_domain

  service_url_env = {
    IDENTITY_URL             = "http://identity-service.${local.service_host_suffix}"
    ENROLLMENT_URL           = "http://enrollment-service.${local.service_host_suffix}"
    DEPARTMENT_URL           = "http://department-service.${local.service_host_suffix}"
    SPORTS_PARTICIPATION_URL = "http://sports-participation-service.${local.service_host_suffix}"
    EVENT_CONFIGURATION_URL  = "http://event-configuration-service.${local.service_host_suffix}"
    SCHEDULING_URL           = "http://scheduling-service.${local.service_host_suffix}"
    SCORING_URL              = "http://scoring-service.${local.service_host_suffix}"
    REPORTING_URL            = "http://reporting-service.${local.service_host_suffix}"
  }

  common_env = {
    JWT_SECRET         = var.jwt_secret
    JWT_EXPIRES_IN     = var.jwt_expires_in
    ADMIN_REG_NUMBER   = var.admin_reg_number
    APP_ENV            = var.app_env
    LOG_LEVEL          = var.log_level
    REDIS_URL          = "redis://${azurerm_redis_cache.redis.hostname}:6379"
    EMAIL_PROVIDER     = var.email_provider
    GMAIL_USER         = var.gmail_user
    GMAIL_APP_PASSWORD = var.gmail_app_password
    SENDGRID_USER      = var.sendgrid_user
    SENDGRID_API_KEY   = var.sendgrid_api_key
    RESEND_API_KEY     = var.resend_api_key
    SMTP_HOST          = var.smtp_host
    SMTP_USER          = var.smtp_user
    SMTP_PASSWORD      = var.smtp_password
    SMTP_PORT          = tostring(var.smtp_port)
    SMTP_SECURE        = tostring(var.smtp_secure)
    EMAIL_FROM         = var.email_from
    EMAIL_FROM_NAME    = var.email_from_name
    APP_NAME           = var.app_name
  }

  mongo_env = {
    for name, _ in local.services :
    name => {
      MONGODB_URI   = var.mongo_uris[name]
      DATABASE_NAME = var.database_names[name]
    }
  }

  service_env = {
    for name, _ in local.services :
    name => merge(local.service_url_env, local.common_env, local.mongo_env[name])
  }
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
  tags                = var.tags
}

resource "azurerm_log_analytics_workspace" "logs" {
  name                = var.log_analytics_workspace_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_container_app_environment" "env" {
  name                       = var.aca_environment_name
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = var.tags
}

resource "azurerm_redis_cache" "redis" {
  name                = "${var.aca_environment_name}-redis"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = var.redis_capacity
  family              = var.redis_family
  sku_name            = var.redis_sku_name
  enable_non_ssl_port = true
  minimum_tls_version = "1.2"
  tags                = var.tags
}

resource "azurerm_dns_zone" "zone" {
  count               = var.use_existing_dns_zone ? 0 : 1
  name                = var.dns_zone_name
  resource_group_name = azurerm_resource_group.rg.name
  tags                = var.tags
}

data "azurerm_dns_zone" "zone" {
  count               = var.use_existing_dns_zone ? 1 : 0
  name                = var.dns_zone_name
  resource_group_name = var.dns_zone_resource_group
}

locals {
  dns_zone_name = var.use_existing_dns_zone ? data.azurerm_dns_zone.zone[0].name : azurerm_dns_zone.zone[0].name
  dns_zone_rg   = var.use_existing_dns_zone ? data.azurerm_dns_zone.zone[0].resource_group_name : azurerm_dns_zone.zone[0].resource_group_name
}

resource "azurerm_container_app" "services" {
  for_each                      = local.services
  name                          = each.key
  container_app_environment_id  = azurerm_container_app_environment.env.id
  resource_group_name           = azurerm_resource_group.rg.name
  revision_mode                 = "Single"

  ingress {
    external_enabled = false
    target_port      = each.value.port
    transport        = "auto"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  template {
    container {
      name   = each.key
      image  = "${azurerm_container_registry.acr.login_server}/annual-sports-${each.key}:${var.image_tag}"
      cpu    = var.service_cpu
      memory = var.service_memory

      dynamic "env" {
        for_each = local.service_env[each.key]
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
}

resource "azurerm_container_app" "frontend" {
  name                         = "annual-sports-frontend"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "auto"
  }

  registry {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  template {
    container {
      name   = "frontend"
      image  = "${azurerm_container_registry.acr.login_server}/annual-sports-frontend:${var.image_tag}"
      cpu    = var.frontend_cpu
      memory = var.frontend_memory
    }
  }
}

locals {
  service_fqdns = {
    for name, app in azurerm_container_app.services :
    name => app.ingress[0].fqdn
  }

  nginx_conf = <<-EOT
  events {}
  http {
    server {
      listen 80;
      location /identities { proxy_pass http://${local.service_fqdns["identity-service"]}; }
      location /enrollments { proxy_pass http://${local.service_fqdns["enrollment-service"]}; }
      location /departments { proxy_pass http://${local.service_fqdns["department-service"]}; }
      location /sports-participations { proxy_pass http://${local.service_fqdns["sports-participation-service"]}; }
      location /event-configurations { proxy_pass http://${local.service_fqdns["event-configuration-service"]}; }
      location /schedulings { proxy_pass http://${local.service_fqdns["scheduling-service"]}; }
      location /scorings { proxy_pass http://${local.service_fqdns["scoring-service"]}; }
      location /reportings { proxy_pass http://${local.service_fqdns["reporting-service"]}; }
    }
  }
  EOT

  nginx_conf_base64 = base64encode(local.nginx_conf)
}

resource "azurerm_container_app" "api_gateway" {
  name                         = "annual-sports-api-gateway"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "auto"
  }

  template {
    container {
      name   = "api-gateway"
      image  = var.api_gateway_image
      cpu    = 0.25
      memory = "0.5Gi"
      command = ["/bin/sh", "-c"]
      args = [
        "echo \"$NGINX_CONF_BASE64\" | base64 -d > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"
      ]

      env {
        name  = "NGINX_CONF_BASE64"
        value = local.nginx_conf_base64
      }
    }
  }
}

resource "azurerm_dns_cname_record" "frontend" {
  name                = replace(var.domain, ".${var.dns_zone_name}", "")
  zone_name           = local.dns_zone_name
  resource_group_name = local.dns_zone_rg
  ttl                 = 300
  record              = azurerm_container_app.frontend.ingress[0].fqdn
}

resource "azurerm_dns_cname_record" "api" {
  count               = var.api_domain != "" ? 1 : 0
  name                = replace(var.api_domain, ".${var.dns_zone_name}", "")
  zone_name           = local.dns_zone_name
  resource_group_name = local.dns_zone_rg
  ttl                 = 300
  record              = azurerm_container_app.api_gateway.ingress[0].fqdn
}

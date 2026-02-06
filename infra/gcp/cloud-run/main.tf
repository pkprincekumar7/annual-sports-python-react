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

  service_url_env = {
    IDENTITY_URL             = google_cloud_run_v2_service.services["identity-service"].uri
    ENROLLMENT_URL           = google_cloud_run_v2_service.services["enrollment-service"].uri
    DEPARTMENT_URL           = google_cloud_run_v2_service.services["department-service"].uri
    SPORTS_PARTICIPATION_URL = google_cloud_run_v2_service.services["sports-participation-service"].uri
    EVENT_CONFIGURATION_URL  = google_cloud_run_v2_service.services["event-configuration-service"].uri
    SCHEDULING_URL           = google_cloud_run_v2_service.services["scheduling-service"].uri
    SCORING_URL              = google_cloud_run_v2_service.services["scoring-service"].uri
    REPORTING_URL            = google_cloud_run_v2_service.services["reporting-service"].uri
  }

  common_env = {
    JWT_SECRET         = var.jwt_secret
    JWT_EXPIRES_IN     = var.jwt_expires_in
    ADMIN_REG_NUMBER   = var.admin_reg_number
    APP_ENV            = var.app_env
    LOG_LEVEL          = var.log_level
    REDIS_URL          = "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
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

  dns_project = var.use_existing_dns_zone && var.dns_zone_project != "" ? var.dns_zone_project : var.project_id
}

resource "google_compute_network" "vpc" {
  name                    = var.vpc_name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.subnet_name
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_vpc_access_connector" "connector" {
  name   = var.vpc_connector_name
  region = var.region
  subnet {
    name = google_compute_subnetwork.subnet.name
  }
}

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = var.artifact_registry_name
  format        = "DOCKER"
}

resource "google_service_account" "gateway" {
  account_id   = "annual-sports-gateway"
  display_name = "Annual Sports API Gateway"
}

resource "google_redis_instance" "redis" {
  name           = "annual-sports-redis"
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_gb
}

resource "google_dns_managed_zone" "zone" {
  count       = var.use_existing_dns_zone ? 0 : 1
  name        = var.dns_zone_resource_name
  dns_name    = "${var.dns_zone_name}."
  description = "Managed by Terraform"
}

data "google_dns_managed_zone" "zone" {
  count   = var.use_existing_dns_zone ? 1 : 0
  name    = var.dns_zone_resource_name
  project = local.dns_project
}

locals {
  dns_zone_name   = var.use_existing_dns_zone ? data.google_dns_managed_zone.zone[0].name : google_dns_managed_zone.zone[0].name
  dns_zone_project = local.dns_project
}

resource "google_cloud_run_v2_service" "services" {
  for_each = local.services
  name     = each.key
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/annual-sports-${each.key}:${var.image_tag}"
      ports { container_port = each.value.port }

      resources {
        limits = {
          cpu    = var.service_cpu
          memory = var.service_memory
        }
      }

      dynamic "env" {
        for_each = local.service_env[each.key]
        content {
          name  = env.key
          value = env.value
        }
      }
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "ALL_TRAFFIC"
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "services_invoker" {
  for_each = local.services
  name     = google_cloud_run_v2_service.services[each.key].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gateway.email}"
}

resource "google_cloud_run_v2_service" "frontend" {
  name     = "annual-sports-frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/annual-sports-frontend:${var.image_tag}"
      ports { container_port = 80 }

      resources {
        limits = {
          cpu    = var.frontend_cpu
          memory = var.frontend_memory
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  name     = google_cloud_run_v2_service.frontend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

locals {
  nginx_conf = <<-EOT
  events {}
  http {
    server {
      listen 80;
      location /identities { proxy_pass ${google_cloud_run_v2_service.services["identity-service"].uri}; }
      location /enrollments { proxy_pass ${google_cloud_run_v2_service.services["enrollment-service"].uri}; }
      location /departments { proxy_pass ${google_cloud_run_v2_service.services["department-service"].uri}; }
      location /sports-participations { proxy_pass ${google_cloud_run_v2_service.services["sports-participation-service"].uri}; }
      location /event-configurations { proxy_pass ${google_cloud_run_v2_service.services["event-configuration-service"].uri}; }
      location /schedulings { proxy_pass ${google_cloud_run_v2_service.services["scheduling-service"].uri}; }
      location /scorings { proxy_pass ${google_cloud_run_v2_service.services["scoring-service"].uri}; }
      location /reportings { proxy_pass ${google_cloud_run_v2_service.services["reporting-service"].uri}; }
    }
  }
  EOT

  nginx_conf_base64 = base64encode(local.nginx_conf)
}

resource "google_cloud_run_v2_service" "api_gateway" {
  name     = "annual-sports-api-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.gateway.email
    containers {
      image = var.api_gateway_image
      ports { container_port = 80 }

      env {
        name  = "NGINX_CONF_BASE64"
        value = local.nginx_conf_base64
      }

      command = ["/bin/sh", "-c"]
      args = ["echo \"$NGINX_CONF_BASE64\" | base64 -d > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]

      resources {
        limits = {
          cpu    = "0.5"
          memory = "512Mi"
        }
      }
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "ALL_TRAFFIC"
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "gateway_public" {
  name     = google_cloud_run_v2_service.api_gateway.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_dns_record_set" "frontend" {
  name         = "${var.domain}."
  managed_zone = local.dns_zone_name
  project      = local.dns_zone_project
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["${replace(google_cloud_run_v2_service.frontend.uri, "https://", "")}."]
}

resource "google_dns_record_set" "api" {
  count        = var.api_domain != "" ? 1 : 0
  name         = "${var.api_domain}."
  managed_zone = local.dns_zone_name
  project      = local.dns_zone_project
  type         = "CNAME"
  ttl          = 300
  rrdatas      = ["${replace(google_cloud_run_v2_service.api_gateway.uri, "https://", "")}."]
}

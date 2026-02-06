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
    IDENTITY_URL             = "http://identity-service:8001"
    ENROLLMENT_URL           = "http://enrollment-service:8002"
    DEPARTMENT_URL           = "http://department-service:8003"
    SPORTS_PARTICIPATION_URL = "http://sports-participation-service:8004"
    EVENT_CONFIGURATION_URL  = "http://event-configuration-service:8005"
    SCHEDULING_URL           = "http://scheduling-service:8006"
    SCORING_URL              = "http://scoring-service:8007"
    REPORTING_URL            = "http://reporting-service:8008"
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
  name                    = var.network_name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.subnet_name
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_container_cluster" "gke" {
  name     = var.cluster_name
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name
}

resource "google_container_node_pool" "default" {
  name       = "default-pool"
  location   = var.region
  cluster    = google_container_cluster.gke.name
  node_count = var.node_count

  node_config {
    machine_type = var.node_machine_type
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
}

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = var.artifact_registry_name
  format        = "DOCKER"
}

resource "google_redis_instance" "redis" {
  name           = "${var.cluster_name}-redis"
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_gb
}

resource "google_compute_address" "ingress" {
  name   = "${var.cluster_name}-ingress-ip"
  region = var.region
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

resource "google_dns_record_set" "frontend" {
  name         = "${var.domain}."
  managed_zone = local.dns_zone_name
  project      = local.dns_zone_project
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.ingress.address]
}

resource "google_dns_record_set" "api" {
  count        = var.api_domain != "" ? 1 : 0
  name         = "${var.api_domain}."
  managed_zone = local.dns_zone_name
  project      = local.dns_zone_project
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.ingress.address]
}

data "google_container_cluster" "cluster" {
  name     = google_container_cluster.gke.name
  location = var.region
}

data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${data.google_container_cluster.cluster.endpoint}"
  cluster_ca_certificate = base64decode(data.google_container_cluster.cluster.master_auth[0].cluster_ca_certificate)
  token                  = data.google_client_config.default.access_token
}

provider "helm" {
  kubernetes {
    host                   = "https://${data.google_container_cluster.cluster.endpoint}"
    cluster_ca_certificate = base64decode(data.google_container_cluster.cluster.master_auth[0].cluster_ca_certificate)
    token                  = data.google_client_config.default.access_token
  }
}

resource "helm_release" "ingress_nginx" {
  name             = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  namespace        = "ingress-nginx"
  create_namespace = true

  set {
    name  = "controller.service.loadBalancerIP"
    value = google_compute_address.ingress.address
  }
}

resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = "annual-sports"
  }
}

resource "kubernetes_secret_v1" "service_env" {
  for_each = local.services
  metadata {
    name      = "${each.key}-env"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  type        = "Opaque"
  string_data = local.service_env[each.key]
}

resource "kubernetes_deployment_v1" "services" {
  for_each = local.services
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    labels = {
      app = each.key
    }
  }
  spec {
    replicas = 1
    selector {
      match_labels = {
        app = each.key
      }
    }
    template {
      metadata {
        labels = {
          app = each.key
        }
      }
      spec {
        container {
          name  = each.key
          image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/annual-sports-${each.key}:${var.image_tag}"
          port {
            container_port = each.value.port
          }
          env_from {
            secret_ref {
              name = kubernetes_secret_v1.service_env[each.key].metadata[0].name
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "services" {
  for_each = local.services
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    labels = {
      app = each.key
    }
  }
  spec {
    type = "ClusterIP"
    selector = {
      app = each.key
    }
    port {
      port        = each.value.port
      target_port = each.value.port
    }
  }
}

resource "kubernetes_deployment_v1" "frontend" {
  metadata {
    name      = "annual-sports-frontend"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    labels = {
      app = "annual-sports-frontend"
    }
  }
  spec {
    replicas = 1
    selector {
      match_labels = {
        app = "annual-sports-frontend"
      }
    }
    template {
      metadata {
        labels = {
          app = "annual-sports-frontend"
        }
      }
      spec {
        container {
          name  = "annual-sports-frontend"
          image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/annual-sports-frontend:${var.image_tag}"
          port {
            container_port = 80
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "frontend" {
  metadata {
    name      = "annual-sports-frontend"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }
  spec {
    type = "ClusterIP"
    selector = {
      app = "annual-sports-frontend"
    }
    port {
      port        = 80
      target_port = 80
    }
  }
}

resource "kubernetes_ingress_v1" "app" {
  metadata {
    name      = "annual-sports-ingress"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.class" = "nginx"
    }
  }

  spec {
    dynamic "rule" {
      for_each = toset(compact([var.domain, var.api_domain]))
      content {
        host = rule.value
        http {
          dynamic "path" {
            for_each = rule.value == var.domain ? [
              { path = "/", service = "annual-sports-frontend", port = 80 },
              { path = "/identities", service = "identity-service", port = 8001 },
              { path = "/enrollments", service = "enrollment-service", port = 8002 },
              { path = "/departments", service = "department-service", port = 8003 },
              { path = "/sports-participations", service = "sports-participation-service", port = 8004 },
              { path = "/event-configurations", service = "event-configuration-service", port = 8005 },
              { path = "/schedulings", service = "scheduling-service", port = 8006 },
              { path = "/scorings", service = "scoring-service", port = 8007 },
              { path = "/reportings", service = "reporting-service", port = 8008 }
            ] : [
              { path = "/identities", service = "identity-service", port = 8001 },
              { path = "/enrollments", service = "enrollment-service", port = 8002 },
              { path = "/departments", service = "department-service", port = 8003 },
              { path = "/sports-participations", service = "sports-participation-service", port = 8004 },
              { path = "/event-configurations", service = "event-configuration-service", port = 8005 },
              { path = "/schedulings", service = "scheduling-service", port = 8006 },
              { path = "/scorings", service = "scoring-service", port = 8007 },
              { path = "/reportings", service = "reporting-service", port = 8008 }
            ]
            content {
              path      = path.value.path
              path_type = "Prefix"
              backend {
                service {
                  name = path.value.service
                  port {
                    number = path.value.port
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.ingress_nginx]
}

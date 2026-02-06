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

  ingress_paths = [
    { path = "/", service = "annual-sports-frontend", port = 80 },
    { path = "/identities", service = "identity-service", port = 8001 },
    { path = "/enrollments", service = "enrollment-service", port = 8002 },
    { path = "/departments", service = "department-service", port = 8003 },
    { path = "/sports-participations", service = "sports-participation-service", port = 8004 },
    { path = "/event-configurations", service = "event-configuration-service", port = 8005 },
    { path = "/schedulings", service = "scheduling-service", port = 8006 },
    { path = "/scorings", service = "scoring-service", port = 8007 },
    { path = "/reportings", service = "reporting-service", port = 8008 }
  ]

  api_paths = [
    { path = "/identities", service = "identity-service", port = 8001 },
    { path = "/enrollments", service = "enrollment-service", port = 8002 },
    { path = "/departments", service = "department-service", port = 8003 },
    { path = "/sports-participations", service = "sports-participation-service", port = 8004 },
    { path = "/event-configurations", service = "event-configuration-service", port = 8005 },
    { path = "/schedulings", service = "scheduling-service", port = 8006 },
    { path = "/scorings", service = "scoring-service", port = 8007 },
    { path = "/reportings", service = "reporting-service", port = 8008 }
  ]
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_virtual_network" "vnet" {
  name                = "${var.aks_name}-vnet"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = [var.vnet_cidr]
  tags                = var.tags
}

resource "azurerm_subnet" "aks" {
  name                 = "${var.aks_name}-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [var.aks_subnet_cidr]
}

resource "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.aks_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = "${var.aks_name}-dns"
  kubernetes_version  = "1.29"

  default_node_pool {
    name           = "system"
    node_count     = var.node_count
    vm_size        = var.node_vm_size
    vnet_subnet_id = azurerm_subnet.aks.id
  }

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
}

resource "azurerm_redis_cache" "redis" {
  name                = "${var.aks_name}-redis"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = var.redis_capacity
  family              = var.redis_family
  sku_name            = var.redis_sku_name
  enable_non_ssl_port = true
  minimum_tls_version = "1.2"
  tags                = var.tags
}

resource "azurerm_public_ip" "ingress" {
  name                = "${var.aks_name}-ingress-ip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
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

resource "azurerm_dns_a_record" "frontend" {
  name                = replace(var.domain, ".${var.dns_zone_name}", "")
  zone_name           = local.dns_zone_name
  resource_group_name = local.dns_zone_rg
  ttl                 = 300
  records             = [azurerm_public_ip.ingress.ip_address]
}

resource "azurerm_dns_a_record" "api" {
  count               = var.api_domain != "" ? 1 : 0
  name                = replace(var.api_domain, ".${var.dns_zone_name}", "")
  zone_name           = local.dns_zone_name
  resource_group_name = local.dns_zone_rg
  ttl                 = 300
  records             = [azurerm_public_ip.ingress.ip_address]
}

provider "kubernetes" {
  host                   = azurerm_kubernetes_cluster.aks.kube_config[0].host
  client_certificate     = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_certificate)
  client_key             = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_key)
  cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = azurerm_kubernetes_cluster.aks.kube_config[0].host
    client_certificate     = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_certificate)
    client_key             = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_key)
    cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].cluster_ca_certificate)
  }
}

resource "helm_release" "ingress_nginx" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"
  create_namespace = true

  set {
    name  = "controller.service.loadBalancerIP"
    value = azurerm_public_ip.ingress.ip_address
  }

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/azure-load-balancer-resource-group"
    value = azurerm_resource_group.rg.name
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
          image = "${azurerm_container_registry.acr.login_server}/annual-sports-${each.key}:${var.image_tag}"
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
          image = "${azurerm_container_registry.acr.login_server}/annual-sports-frontend:${var.image_tag}"
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
            for_each = rule.value == var.domain ? local.ingress_paths : local.api_paths
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

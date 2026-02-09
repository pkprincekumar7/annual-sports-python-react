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
        service_account_name = kubernetes_service_account_v1.services[each.key].metadata[0].name
        container {
          name  = each.key
          image = "${local.image_prefix}/${local.name_prefix}-${each.key}:${var.image_tag}"
          port {
            container_port = each.value.port
          }
          resources {
            limits = {
              cpu    = local.service_resources[each.key].cpu_limit
              memory = local.service_resources[each.key].memory_limit
            }
            requests = {
              cpu    = local.service_resources[each.key].cpu_request
              memory = local.service_resources[each.key].memory_request
            }
          }
          readiness_probe {
            http_get {
              path = "/health"
              port = each.value.port
            }
            initial_delay_seconds = 10
            period_seconds        = 10
          }
          liveness_probe {
            http_get {
              path = "/health"
              port = each.value.port
            }
            initial_delay_seconds = 30
            period_seconds        = 20
          }
          env_from {
            secret_ref {
              name = "${each.key}-secrets"
            }
          }
          env_from {
            config_map_ref {
              name = kubernetes_config_map_v1.service_env[each.key].metadata[0].name
            }
          }
        }
      }
    }
  }
}

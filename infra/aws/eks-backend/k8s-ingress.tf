resource "kubernetes_ingress_v1" "alb" {
  metadata {
    name      = "annual-sports-ingress"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    annotations = local.alb_annotations
  }

  spec {
    ingress_class_name = "alb"

    dynamic "rule" {
      for_each = local.ingress_hosts
      content {
        host = rule.key
        http {
          dynamic "path" {
            for_each = local.api_paths
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

  depends_on = [helm_release.alb_controller]
}

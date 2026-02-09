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

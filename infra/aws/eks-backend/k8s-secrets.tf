resource "kubernetes_config_map_v1" "service_env" {
  for_each = local.services
  metadata {
    name      = "${each.key}-env"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  data = local.service_env[each.key]
}

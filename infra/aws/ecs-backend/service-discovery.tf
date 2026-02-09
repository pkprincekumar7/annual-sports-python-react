resource "aws_service_discovery_private_dns_namespace" "namespace" {
  name = local.service_discovery_namespace
  vpc  = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "services" {
  for_each = local.services
  name     = each.key
  force_destroy = true

  lifecycle {
    ignore_changes = [health_check_custom_config]
  }

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.namespace.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
}

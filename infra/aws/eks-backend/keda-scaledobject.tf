resource "kubernetes_manifest" "keda_scaledobject" {
  for_each = var.enable_keda_alb_scaling ? local.services : {}
  manifest = {
    apiVersion = "keda.sh/v1alpha1"
    kind       = "ScaledObject"
    metadata = {
      name      = "${each.key}-alb-requests"
      namespace = kubernetes_namespace_v1.app.metadata[0].name
    }
    spec = {
      scaleTargetRef = {
        name = each.key
      }
      pollingInterval = var.keda_polling_interval
      cooldownPeriod  = var.keda_cooldown_period
      minReplicaCount = var.hpa_min_replicas
      maxReplicaCount = var.hpa_max_replicas
      triggers = [
        {
          type = "cpu"
          metricType = "Utilization"
          metadata = {
            value = tostring(var.hpa_cpu_target)
          }
        },
        {
          type = "memory"
          metricType = "Utilization"
          metadata = {
            value = tostring(var.hpa_memory_target)
          }
        },
        {
          type = "aws-cloudwatch"
          metadata = {
            namespace     = "AWS/ApplicationELB"
            metricName    = "RequestCountPerTarget"
            dimensionName = "TargetGroup"
            dimensionValue = var.alb_target_group_arn_suffixes[each.key]
            statistic     = "Sum"
            targetValue   = tostring(var.alb_request_target)
            awsRegion     = var.aws_region
          }
        }
      ]
    }
  }
  depends_on = [helm_release.keda]
}

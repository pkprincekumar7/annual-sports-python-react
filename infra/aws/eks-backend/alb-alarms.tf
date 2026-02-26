# ALB CloudWatch alarms (matches ECS alb-alarms.tf).
# ALB is created by the Ingress controller; per-service alarms require alb_target_group_arn_suffixes.
data "aws_lb" "app_for_alarms" {
  count       = var.enable_alb_alarms ? 1 : 0
  name        = local.alb_name
  depends_on  = [kubernetes_ingress_v1.alb]
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count               = var.enable_alb_alarms ? 1 : 0
  alarm_name          = "${local.name_prefix}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.alarm_alb_5xx_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions = {
    LoadBalancer = data.aws_lb.app_for_alarms[0].arn_suffix
  }
}

# Per-service alarms require alb_target_group_arn_suffixes (same as KEDA; fetch after ALB creation)
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each            = var.enable_alb_alarms ? { for k, v in local.services : k => v if lookup(var.alb_target_group_arn_suffixes, k, "") != "" } : {}
  alarm_name          = "${local.name_prefix}-${each.key}-target-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.alarm_target_5xx_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions = {
    LoadBalancer = data.aws_lb.app_for_alarms[0].arn_suffix
    TargetGroup  = var.alb_target_group_arn_suffixes[each.key]
  }
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  for_each            = var.enable_alb_alarms ? { for k, v in local.services : k => v if lookup(var.alb_target_group_arn_suffixes, k, "") != "" } : {}
  alarm_name          = "${local.name_prefix}-${each.key}-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = var.alarm_unhealthy_host_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions = {
    LoadBalancer = data.aws_lb.app_for_alarms[0].arn_suffix
    TargetGroup  = var.alb_target_group_arn_suffixes[each.key]
  }
}

resource "aws_cloudwatch_metric_alarm" "target_response_time" {
  for_each            = var.enable_alb_alarms ? { for k, v in local.services : k => v if lookup(var.alb_target_group_arn_suffixes, k, "") != "" } : {}
  alarm_name          = "${local.name_prefix}-${each.key}-target-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = var.alarm_target_response_time_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  dimensions = {
    LoadBalancer = data.aws_lb.app_for_alarms[0].arn_suffix
    TargetGroup  = var.alb_target_group_arn_suffixes[each.key]
  }
}

resource "aws_cloudwatch_log_group" "services" {
  for_each         = local.services
  name             = "/eks/${local.name_prefix}/${each.key}"
  retention_in_days = var.log_retention_days
}

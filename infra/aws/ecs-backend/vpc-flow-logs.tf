resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  count             = var.flow_logs_enabled ? 1 : 0
  name              = "/vpc/${local.name_prefix}/flow-logs"
  retention_in_days = var.flow_logs_retention_days
}

data "aws_iam_policy_document" "vpc_flow_logs_assume" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "vpc_flow_logs" {
  count              = var.flow_logs_enabled ? 1 : 0
  name               = "${local.name_prefix}-vpc-flow-logs"
  assume_role_policy = data.aws_iam_policy_document.vpc_flow_logs_assume.json
}

data "aws_iam_policy_document" "vpc_flow_logs" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams"
    ]
    resources = ["${aws_cloudwatch_log_group.vpc_flow_logs[0].arn}:*"]
  }
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  count  = var.flow_logs_enabled ? 1 : 0
  name   = "${local.name_prefix}-vpc-flow-logs"
  role   = aws_iam_role.vpc_flow_logs[0].id
  policy = data.aws_iam_policy_document.vpc_flow_logs.json
}

resource "aws_flow_log" "vpc" {
  count                = var.flow_logs_enabled ? 1 : 0
  iam_role_arn          = aws_iam_role.vpc_flow_logs[0].arn
  log_destination       = aws_cloudwatch_log_group.vpc_flow_logs[0].arn
  traffic_type          = "ALL"
  vpc_id                = module.vpc.vpc_id
  max_aggregation_interval = 60
}

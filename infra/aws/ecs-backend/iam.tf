resource "aws_iam_role" "task_execution" {
  name = "${local.name_prefix}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "secrets_access" {
  name        = "${local.name_prefix}-secrets-access"
  description = "Allow ECS task execution to read Secrets Manager values."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.mongo_uri.arn,
          aws_secretsmanager_secret.redis_auth_token.arn,
          aws_secretsmanager_secret.gmail_app_password.arn,
          aws_secretsmanager_secret.sendgrid_api_key.arn,
          aws_secretsmanager_secret.resend_api_key.arn,
          aws_secretsmanager_secret.smtp_password.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_secrets" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.secrets_access.arn
}

resource "aws_iam_policy" "kms_decrypt" {
  name        = "${local.name_prefix}-kms-decrypt"
  description = "Allow ECS task execution to decrypt Secrets Manager secrets."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = local.secrets_kms_key_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_kms" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.kms_decrypt.arn
}

resource "aws_iam_role" "task_role" {
  for_each = local.services
  name = "${local.name_prefix}-${each.key}-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "ecs_exec" {
  name        = "${local.name_prefix}-ecs-exec"
  description = "Allow ECS Exec via SSM."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_role_ecs_exec" {
  for_each   = local.services
  role       = aws_iam_role.task_role[each.key].name
  policy_arn = aws_iam_policy.ecs_exec.arn
}

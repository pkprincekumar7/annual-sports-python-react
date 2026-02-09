data "aws_caller_identity" "current" {}

resource "aws_kms_key" "secrets" {
  count               = var.create_secrets_kms_key && var.secrets_kms_key_arn == "" ? 1 : 0
  description         = "KMS key for Secrets Manager (${local.name_prefix})."
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAccountAdmin"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowEcsTaskExecutionDecrypt"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.task_execution.arn
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "secrets" {
  count        = var.create_secrets_kms_key && var.secrets_kms_key_arn == "" ? 1 : 0
  name         = "alias/${local.name_prefix}-secrets"
  target_key_id = aws_kms_key.secrets[0].key_id
}

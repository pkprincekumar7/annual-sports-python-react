resource "aws_kms_key" "secrets" {
  count               = var.create_secrets_kms_key && var.secrets_kms_key_arn == "" ? 1 : 0
  description         = "KMS key for Secrets Manager (${local.name_prefix})."
  enable_key_rotation = true
}

resource "aws_kms_alias" "secrets" {
  count        = var.create_secrets_kms_key && var.secrets_kms_key_arn == "" ? 1 : 0
  name         = "alias/${local.name_prefix}-secrets"
  target_key_id = aws_kms_key.secrets[0].key_id
}

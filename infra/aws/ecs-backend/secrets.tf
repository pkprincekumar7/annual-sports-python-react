resource "aws_secretsmanager_secret" "jwt_secret" {
  name       = local.secret_names.jwt_secret
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

resource "aws_secretsmanager_secret" "mongo_uri" {
  name       = local.secret_names.mongo_uri
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

resource "aws_secretsmanager_secret" "gmail_app_password" {
  name       = local.secret_names.gmail_app_password
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

resource "aws_secretsmanager_secret" "sendgrid_api_key" {
  name       = local.secret_names.sendgrid_api_key
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name       = local.secret_names.resend_api_key
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

resource "aws_secretsmanager_secret" "smtp_password" {
  name       = local.secret_names.smtp_password
  kms_key_id = local.secrets_kms_key_arn
  recovery_window_in_days = var.secrets_recovery_window_in_days
}

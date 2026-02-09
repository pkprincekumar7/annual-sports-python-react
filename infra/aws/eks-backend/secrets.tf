resource "aws_secretsmanager_secret" "jwt_secret" {
  name = local.secret_names.jwt_secret
}

resource "aws_secretsmanager_secret" "mongo_uri" {
  name = local.secret_names.mongo_uri
}

resource "aws_secretsmanager_secret" "gmail_app_password" {
  name = local.secret_names.gmail_app_password
}

resource "aws_secretsmanager_secret" "sendgrid_api_key" {
  name = local.secret_names.sendgrid_api_key
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name = local.secret_names.resend_api_key
}

resource "aws_secretsmanager_secret" "smtp_password" {
  name = local.secret_names.smtp_password
}

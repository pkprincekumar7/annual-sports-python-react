locals {
  app_prefix       = get_env("TG_APP_PREFIX", "as")
  state_bucket     = get_env("TG_STATE_BUCKET", "")
  state_lock_table = get_env("TG_STATE_DDB_TABLE", "")
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = local.state_bucket
    key            = "terraform-state-files/${local.app_prefix}/${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = local.state_lock_table
    encrypt        = true
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region = var.aws_region
}
EOF
}

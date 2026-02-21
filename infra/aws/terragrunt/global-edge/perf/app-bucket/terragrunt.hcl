include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  cfg = read_terragrunt_config(find_in_parent_folders("common.hcl"))
}

terraform {
  source = "../../../../app-bucket"
}

dependency "backend_us_east_1" {
  config_path = "../ecs-backend-global/us-east-1"
  mock_outputs = {
    task_role_arns = {
      "identity-service" = "arn:aws:iam::123456789012:role/mock-identity"
    }
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_eu_west_1" {
  config_path = "../ecs-backend-global/eu-west-1"
  mock_outputs = {
    task_role_arns = {
      "identity-service" = "arn:aws:iam::123456789012:role/mock-identity-eu"
    }
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_ap_southeast_1" {
  config_path = "../ecs-backend-global/ap-southeast-1"
  mock_outputs = {
    task_role_arns = {
      "identity-service" = "arn:aws:iam::123456789012:role/mock-identity-ap"
    }
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  aws_region  = "us-east-1"
  bucket_name = local.cfg.locals.app_s3_bucket_name
  task_role_arns = concat(
    values(dependency.backend_us_east_1.outputs.task_role_arns),
    values(dependency.backend_eu_west_1.outputs.task_role_arns),
    values(dependency.backend_ap_southeast_1.outputs.task_role_arns)
  )
}

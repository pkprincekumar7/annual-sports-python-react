include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  cfg = read_terragrunt_config(find_in_parent_folders("common.hcl"))
}

terraform {
  source = "../../../../redis-global"
}

dependency "backend_us_east_1" {
  config_path = "../ecs-backend-initial/us-east-1"
  mock_outputs = {
    vpc_id                      = "vpc-mock-us"
    private_subnet_ids          = ["subnet-mock-us-a", "subnet-mock-us-b"]
    ecs_tasks_security_group_id = "sg-mock-us"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_eu_west_1" {
  config_path = "../ecs-backend-initial/eu-west-1"
  mock_outputs = {
    vpc_id                      = "vpc-mock-eu"
    private_subnet_ids          = ["subnet-mock-eu-a", "subnet-mock-eu-b"]
    ecs_tasks_security_group_id = "sg-mock-eu"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "backend_ap_southeast_1" {
  config_path = "../ecs-backend-initial/ap-southeast-1"
  mock_outputs = {
    vpc_id                      = "vpc-mock-ap"
    private_subnet_ids          = ["subnet-mock-ap-a", "subnet-mock-ap-b"]
    ecs_tasks_security_group_id = "sg-mock-ap"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  primary_region = "us-east-1"
  app_prefix     = local.cfg.locals.app_prefix
  env            = local.cfg.locals.env

  primary_vpc_id     = dependency.backend_us_east_1.outputs.vpc_id
  primary_subnet_ids = dependency.backend_us_east_1.outputs.private_subnet_ids
  primary_ecs_sg_id  = dependency.backend_us_east_1.outputs.ecs_tasks_security_group_id

  enable_eu_west_1     = true
  eu_west_1_vpc_id     = dependency.backend_eu_west_1.outputs.vpc_id
  eu_west_1_subnet_ids = dependency.backend_eu_west_1.outputs.private_subnet_ids
  eu_west_1_ecs_sg_id  = dependency.backend_eu_west_1.outputs.ecs_tasks_security_group_id

  enable_ap_southeast_1     = true
  ap_southeast_1_vpc_id     = dependency.backend_ap_southeast_1.outputs.vpc_id
  ap_southeast_1_subnet_ids = dependency.backend_ap_southeast_1.outputs.private_subnet_ids
  ap_southeast_1_ecs_sg_id  = dependency.backend_ap_southeast_1.outputs.ecs_tasks_security_group_id

  redis_node_type  = local.cfg.locals.redis_node_type
  redis_auth_token = local.cfg.locals.redis_auth_token
}

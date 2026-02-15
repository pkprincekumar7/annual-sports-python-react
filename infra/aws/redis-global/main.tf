provider "aws" {
  region = var.primary_region
}

provider "aws" {
  alias  = "eu_west_1"
  region = "eu-west-1"
}

provider "aws" {
  alias  = "ap_southeast_1"
  region = "ap-southeast-1"
}

locals {
  name_prefix  = "${var.app_prefix}-${var.env}"
  primary_name = "${local.name_prefix}-redis-global"
  multi_az_enabled = var.redis_num_cache_nodes > 1
  automatic_failover_enabled = var.redis_num_cache_nodes > 1
}

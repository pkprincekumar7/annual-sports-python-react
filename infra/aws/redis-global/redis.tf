resource "aws_elasticache_subnet_group" "primary" {
  name       = "${local.primary_name}-subnets"
  subnet_ids = var.primary_subnet_ids
}

resource "aws_security_group" "primary" {
  name        = "${local.primary_name}-sg"
  description = "Redis access from ECS tasks (primary)"
  vpc_id      = var.primary_vpc_id
}

resource "aws_security_group_rule" "primary_ingress" {
  type                     = "ingress"
  from_port                = var.redis_port
  to_port                  = var.redis_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.primary.id
  source_security_group_id = var.primary_ecs_sg_id
}

resource "aws_security_group_rule" "primary_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.primary.id
}

resource "aws_elasticache_replication_group" "primary" {
  replication_group_id          = local.primary_name
  description                   = "Primary Redis replication group for ${local.name_prefix}."
  engine                        = "redis"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.redis_num_cache_nodes
  port                          = var.redis_port
  subnet_group_name             = aws_elasticache_subnet_group.primary.name
  security_group_ids            = [aws_security_group.primary.id]
  automatic_failover_enabled    = local.automatic_failover_enabled
  multi_az_enabled              = local.multi_az_enabled
  transit_encryption_enabled    = var.redis_transit_encryption_enabled
  at_rest_encryption_enabled    = var.redis_at_rest_encryption_enabled
  auth_token                    = var.redis_transit_encryption_enabled ? var.redis_auth_token : null
  snapshot_retention_limit      = var.redis_snapshot_retention_limit
  snapshot_window               = var.redis_snapshot_window
}

resource "aws_elasticache_global_replication_group" "global" {
  global_replication_group_id_suffix = "${local.name_prefix}-redis"
  primary_replication_group_id       = aws_elasticache_replication_group.primary.id
}

resource "aws_elasticache_subnet_group" "eu_west_1" {
  provider   = aws.eu_west_1
  count      = var.enable_eu_west_1 ? 1 : 0
  name       = "${local.primary_name}-eu-west-1-subnets"
  subnet_ids = var.eu_west_1_subnet_ids
}

resource "aws_security_group" "eu_west_1" {
  provider    = aws.eu_west_1
  count       = var.enable_eu_west_1 ? 1 : 0
  name        = "${local.primary_name}-eu-west-1-sg"
  description = "Redis access from ECS tasks (eu-west-1)"
  vpc_id      = var.eu_west_1_vpc_id
}

resource "aws_security_group_rule" "eu_west_1_ingress" {
  provider                 = aws.eu_west_1
  count                    = var.enable_eu_west_1 ? 1 : 0
  type                     = "ingress"
  from_port                = var.redis_port
  to_port                  = var.redis_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eu_west_1[0].id
  source_security_group_id = var.eu_west_1_ecs_sg_id
}

resource "aws_security_group_rule" "eu_west_1_egress" {
  provider          = aws.eu_west_1
  count             = var.enable_eu_west_1 ? 1 : 0
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eu_west_1[0].id
}

resource "aws_elasticache_replication_group" "eu_west_1" {
  provider                      = aws.eu_west_1
  count                         = var.enable_eu_west_1 ? 1 : 0
  replication_group_id          = "${local.primary_name}-eu-west-1"
  description                   = "Secondary Redis replication group for ${local.name_prefix} (eu-west-1)."
  subnet_group_name             = aws_elasticache_subnet_group.eu_west_1[0].name
  security_group_ids            = [aws_security_group.eu_west_1[0].id]
  global_replication_group_id   = aws_elasticache_global_replication_group.global.global_replication_group_id
}

resource "aws_elasticache_subnet_group" "ap_southeast_1" {
  provider   = aws.ap_southeast_1
  count      = var.enable_ap_southeast_1 ? 1 : 0
  name       = "${local.primary_name}-ap-southeast-1-subnets"
  subnet_ids = var.ap_southeast_1_subnet_ids
}

resource "aws_security_group" "ap_southeast_1" {
  provider    = aws.ap_southeast_1
  count       = var.enable_ap_southeast_1 ? 1 : 0
  name        = "${local.primary_name}-ap-southeast-1-sg"
  description = "Redis access from ECS tasks (ap-southeast-1)"
  vpc_id      = var.ap_southeast_1_vpc_id
}

resource "aws_security_group_rule" "ap_southeast_1_ingress" {
  provider                 = aws.ap_southeast_1
  count                    = var.enable_ap_southeast_1 ? 1 : 0
  type                     = "ingress"
  from_port                = var.redis_port
  to_port                  = var.redis_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ap_southeast_1[0].id
  source_security_group_id = var.ap_southeast_1_ecs_sg_id
}

resource "aws_security_group_rule" "ap_southeast_1_egress" {
  provider          = aws.ap_southeast_1
  count             = var.enable_ap_southeast_1 ? 1 : 0
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ap_southeast_1[0].id
}

resource "aws_elasticache_replication_group" "ap_southeast_1" {
  provider                      = aws.ap_southeast_1
  count                         = var.enable_ap_southeast_1 ? 1 : 0
  replication_group_id          = "${local.primary_name}-ap-southeast-1"
  description                   = "Secondary Redis replication group for ${local.name_prefix} (ap-southeast-1)."
  subnet_group_name             = aws_elasticache_subnet_group.ap_southeast_1[0].name
  security_group_ids            = [aws_security_group.ap_southeast_1[0].id]
  global_replication_group_id   = aws_elasticache_global_replication_group.global.global_replication_group_id
}

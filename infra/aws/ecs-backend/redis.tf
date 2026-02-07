resource "aws_elasticache_subnet_group" "redis" {
  name       = local.redis_name
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name        = local.redis_name
  description = "Redis access from ECS tasks"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group_rule" "redis_ingress" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = [module.vpc.vpc_cidr_block]
  security_group_id = aws_security_group.redis.id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = local.redis_name
  description                   = "Redis replication group for ${local.name_prefix}."
  engine                        = "redis"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.redis_num_cache_nodes
  port                          = 6379
  subnet_group_name             = aws_elasticache_subnet_group.redis.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = local.redis_automatic_failover_enabled
  multi_az_enabled              = local.redis_multi_az_enabled
  transit_encryption_enabled    = var.redis_transit_encryption_enabled
  at_rest_encryption_enabled    = var.redis_at_rest_encryption_enabled
  auth_token                    = var.redis_auth_token
  snapshot_retention_limit      = var.redis_snapshot_retention_limit
  snapshot_window               = var.redis_snapshot_window
}

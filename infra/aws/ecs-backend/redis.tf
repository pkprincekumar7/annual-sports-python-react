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
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.redis.id
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = local.redis_name
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
}

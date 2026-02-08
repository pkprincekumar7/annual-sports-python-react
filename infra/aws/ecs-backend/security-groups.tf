resource "aws_security_group" "alb" {
  name        = local.alb_name
  description = "ALB security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "apigw_vpclink" {
  name        = "${local.name_prefix}-apigw-vpclink"
  description = "API Gateway VPC Link security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "ecs_tasks" {
  name        = local.ecs_tasks_name
  description = "ECS tasks security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  source_security_group_id = aws_security_group.apigw_vpclink.id
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "apigw_vpclink_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.apigw_vpclink.id
  destination_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = [module.vpc.vpc_cidr_block]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_tasks_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = var.ecs_tasks_egress_cidrs
  security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_tasks_ingress_from_alb_services" {
  type                     = "ingress"
  from_port                = 8001
  to_port                  = 8008
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_tasks_ingress_from_self" {
  type              = "ingress"
  from_port         = 8001
  to_port           = 8008
  protocol          = "tcp"
  security_group_id = aws_security_group.ecs_tasks.id
  self              = true
}

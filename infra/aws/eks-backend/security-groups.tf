# Security groups for Private ALB → API Gateway pattern.
# The ALB is created by the AWS Load Balancer Controller; we add rules to allow API Gateway VPC Link.
resource "aws_security_group" "apigw_vpclink" {
  count       = var.cloudfront_enabled ? 1 : 0
  name        = "${local.name_prefix}-apigw-vpclink"
  description = "API Gateway VPC Link security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group_rule" "apigw_vpclink_egress" {
  count             = var.cloudfront_enabled ? 1 : 0
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.apigw_vpclink[0].id
  cidr_blocks       = [module.vpc.vpc_cidr_block]
}

# Allow API Gateway VPC Link to reach the private ALB (created by Ingress controller)
resource "aws_security_group_rule" "alb_ingress_from_apigw" {
  count                    = var.cloudfront_enabled ? 1 : 0
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.apigw_vpclink[0].id
  security_group_id       = data.aws_lb.app[0].security_groups[0]
  description              = "Allow API Gateway VPC Link to reach ALB"
}

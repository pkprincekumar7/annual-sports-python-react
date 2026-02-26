# API Gateway HTTP API with VPC Link to private ALB.
# The ALB is created by the AWS Load Balancer Controller from the Ingress.
data "aws_lb" "app" {
  count       = var.cloudfront_enabled ? 1 : 0
  name        = local.alb_name
  depends_on  = [kubernetes_ingress_v1.alb]
}

data "aws_lb_listener" "app_http" {
  count             = var.cloudfront_enabled ? 1 : 0
  load_balancer_arn = data.aws_lb.app[0].arn
  port              = 80
}

resource "aws_apigatewayv2_api" "http" {
  count         = var.cloudfront_enabled ? 1 : 0
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = var.apigw_cors_allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["*"]
    allow_credentials = false
    max_age           = 3600
  }
}

resource "aws_cloudwatch_log_group" "apigw" {
  count             = var.cloudfront_enabled ? 1 : 0
  name              = "/apigw/${local.name_prefix}/http-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_vpc_link" "alb" {
  count               = var.cloudfront_enabled ? 1 : 0
  name                = "${local.name_prefix}-vpclink"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids   = [aws_security_group.apigw_vpclink[0].id]
}

resource "aws_apigatewayv2_integration" "alb" {
  count                   = var.cloudfront_enabled ? 1 : 0
  api_id                  = aws_apigatewayv2_api.http[0].id
  integration_type        = "HTTP_PROXY"
  integration_method      = "ANY"
  connection_type         = "VPC_LINK"
  connection_id           = aws_apigatewayv2_vpc_link.alb[0].id
  integration_uri         = data.aws_lb_listener.app_http[0].arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "default" {
  count   = var.cloudfront_enabled ? 1 : 0
  api_id  = aws_apigatewayv2_api.http[0].id
  route_key = "$default"
  target  = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_stage" "default" {
  count     = var.cloudfront_enabled ? 1 : 0
  api_id    = aws_apigatewayv2_api.http[0].id
  name      = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw[0].arn
    format = jsonencode({
      requestId       = "$context.requestId"
      ip              = "$context.identity.sourceIp"
      requestTime     = "$context.requestTime"
      httpMethod      = "$context.httpMethod"
      routeKey        = "$context.routeKey"
      status          = "$context.status"
      protocol        = "$context.protocol"
      responseLength  = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

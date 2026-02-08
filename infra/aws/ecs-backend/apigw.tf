resource "aws_apigatewayv2_api" "http" {
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
  name              = "/apigw/${local.name_prefix}/http-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_vpc_link" "alb" {
  name               = "${local.name_prefix}-vpclink"
  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.apigw_vpclink.id]
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.alb.id
  integration_uri        = aws_lb_listener.http.arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = var.env
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
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


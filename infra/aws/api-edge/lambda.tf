data "archive_file" "origin_router" {
  type = "zip"
  source_content = templatefile("${path.module}/lambda/origin-router.js.tmpl", {
    origin_routing_header = var.origin_routing_header
    origin_map_json       = jsonencode(var.origin_routing_map)
    geo_routing_enabled   = var.geo_routing_enabled
    geo_map_json          = jsonencode(var.geo_routing_map)
    origin_domains_json   = jsonencode(var.origin_domains)
    default_origin_id     = var.default_origin_id
  })
  output_path = "${path.module}/lambda/origin-router.zip"
}

resource "aws_iam_role" "origin_router" {
  name = "${local.name_prefix}-edge-origin-router"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com"
          ]
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "origin_router_basic" {
  role       = aws_iam_role.origin_router.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "origin_router" {
  provider      = aws.us_east_1
  function_name = "${local.name_prefix}-edge-origin-router"
  role          = aws_iam_role.origin_router.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  publish       = true

  filename         = data.archive_file.origin_router.output_path
  source_code_hash = data.archive_file.origin_router.output_base64sha256
}

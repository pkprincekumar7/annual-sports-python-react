resource "aws_lb" "app" {
  name               = local.alb_name
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.private_subnets
  enable_deletion_protection = var.alb_deletion_protection

  access_logs {
    enabled = var.alb_access_logs_enabled
    bucket  = data.aws_s3_bucket.alb_logs.id
    prefix  = var.alb_access_logs_prefix
  }
}

resource "aws_route53_record" "api_domain" {
  count   = local.has_route53_zone && var.api_domain != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = true
  }
}

resource "aws_lb_target_group" "services" {
  for_each   = local.services
  name       = "${local.name_prefix}-${local.tg_names[each.key]}"
  port       = each.value.port
  protocol   = "HTTP"
  target_type = "ip"
  vpc_id     = module.vpc.vpc_id
  health_check {
    path = each.value.health_path
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.alb_ssl_policy
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

locals {
  listener_arn = aws_lb_listener.http.arn
}

resource "aws_lb_listener_rule" "service_paths" {
  for_each     = local.services
  listener_arn = local.listener_arn
  priority     = 100 + index(local.sorted_service_keys, each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services[each.key].arn
  }

  condition {
    path_pattern {
      values = each.value.path_patterns
    }
  }
}

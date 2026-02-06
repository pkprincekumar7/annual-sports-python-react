resource "aws_lb" "app" {
  name               = local.alb_name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_route53_record" "api_domain" {
  count   = local.has_route53_zone && var.api_domain != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
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
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
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
  listener_arn = aws_lb_listener.https.arn
}

resource "aws_lb_listener_rule" "service_paths" {
  for_each     = local.services
  listener_arn = local.listener_arn
  priority     = 100 + index(keys(local.services), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services[each.key].arn
  }

  condition {
    path_pattern {
      values = [
        each.key == "identity-service" ? "/identities*" :
        each.key == "enrollment-service" ? "/enrollments*" :
        each.key == "department-service" ? "/departments*" :
        each.key == "sports-participation-service" ? "/sports-participations*" :
        each.key == "event-configuration-service" ? "/event-configurations*" :
        each.key == "scheduling-service" ? "/schedulings*" :
        each.key == "scoring-service" ? "/scorings*" :
        "/reportings*"
      ]
    }
  }
}

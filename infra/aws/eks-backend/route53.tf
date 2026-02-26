# Route53 record for API domain.
# When cloudfront_enabled: points to CloudFront.
# When cloudfront disabled: points to ALB (requires second apply if ALB not ready).
data "aws_lb" "app_direct" {
  count       = !var.cloudfront_enabled && var.route53_zone_id != "" && var.api_domain != "" ? 1 : 0
  name        = local.alb_name
  depends_on  = [kubernetes_ingress_v1.alb]
}

resource "aws_route53_record" "api_domain" {
  count   = var.route53_zone_id != "" && var.api_domain != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = var.cloudfront_enabled ? aws_cloudfront_distribution.api[0].domain_name : data.aws_lb.app_direct[0].dns_name
    zone_id                = var.cloudfront_enabled ? aws_cloudfront_distribution.api[0].hosted_zone_id : data.aws_lb.app_direct[0].zone_id
    evaluate_target_health = !var.cloudfront_enabled
  }
}

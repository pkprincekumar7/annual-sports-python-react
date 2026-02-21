locals {
  app_prefix     = "as"
  aws_account_id = "123456789012"
  domain_root    = "your-domain.com"

  route53_zone_id    = "Z1234567890"
  app_s3_bucket_name = "your-app-bucket"

  frontend_logs_bucket_name = "your-frontend-logs-bucket"
  frontend_cloudfront_acm_cert_arn = "arn:aws:acm:us-east-1:123456789012:certificate/replace-with-your-frontend-cloudfront-cert-id"

  api_edge_cloudfront_acm_cert_arn = "arn:aws:acm:us-east-1:123456789012:certificate/replace-with-your-api-edge-cloudfront-cert-id"
  api_edge_logs_bucket_name        = "your-api-edge-cloudfront-logs-bucket"

  network = {
    "us-east-1" = {
      vpc_cidr           = "10.10.0.0/16"
      availability_zones = ["us-east-1a", "us-east-1b"]
      public_subnets     = ["10.10.1.0/24", "10.10.2.0/24"]
      private_subnets    = ["10.10.11.0/24", "10.10.12.0/24"]
    }
    "eu-west-1" = {
      vpc_cidr           = "10.20.0.0/16"
      availability_zones = ["eu-west-1a", "eu-west-1b"]
      public_subnets     = ["10.20.1.0/24", "10.20.2.0/24"]
      private_subnets    = ["10.20.11.0/24", "10.20.12.0/24"]
    }
    "ap-southeast-1" = {
      vpc_cidr           = "10.30.0.0/16"
      availability_zones = ["ap-southeast-1a", "ap-southeast-1b"]
      public_subnets     = ["10.30.1.0/24", "10.30.2.0/24"]
      private_subnets    = ["10.30.11.0/24", "10.30.12.0/24"]
    }
  }

  acm_certificate_arn_by_region = {
    "us-east-1"      = "arn:aws:acm:us-east-1:123456789012:certificate/replace-with-your-us-cert"
    "eu-west-1"      = "arn:aws:acm:eu-west-1:123456789012:certificate/replace-with-your-eu-cert"
    "ap-southeast-1" = "arn:aws:acm:ap-southeast-1:123456789012:certificate/replace-with-your-ap-cert"
  }

  alb_logs_bucket_by_region = {
    "us-east-1"      = "your-alb-logs-bucket-us-east-1"
    "eu-west-1"      = "your-alb-logs-bucket-eu-west-1"
    "ap-southeast-1" = "your-alb-logs-bucket-ap-southeast-1"
  }

  email_provider             = "gmail"
  gmail_user                 = "your-email@your-domain.com"
  email_from                 = "no-reply@your-domain.com"
  redis_auth_token_bootstrap = "replace-with-sample-redis-token"

  redis_auth_token = "replace-with-strong-shared-redis-token"
  redis_node_type  = "cache.r6g.large"

  geo_routing_enabled = true
  geo_routing_map = {
    "US" = "us-east-1"
    "IE" = "eu-west-1"
    "IN" = "ap-southeast-1"
    "SG" = "ap-southeast-1"
  }

  services = {
    "identity-service" = {
      port           = 8001
      health_path    = "/health"
      tg_suffix      = "id"
      redis_db_index = 0
      db_suffix      = "identity"
      url_env_name   = "IDENTITY_URL"
      path_patterns  = ["/identities*"]
    }
    "enrollment-service" = {
      port           = 8002
      health_path    = "/health"
      tg_suffix      = "enr"
      redis_db_index = 1
      db_suffix      = "enrollment"
      url_env_name   = "ENROLLMENT_URL"
      path_patterns  = ["/enrollments*"]
    }
    "department-service" = {
      port           = 8003
      health_path    = "/health"
      tg_suffix      = "dep"
      redis_db_index = 2
      db_suffix      = "department"
      url_env_name   = "DEPARTMENT_URL"
      path_patterns  = ["/departments*"]
    }
    "sports-part-service" = {
      port           = 8004
      health_path    = "/health"
      tg_suffix      = "sp"
      redis_db_index = 3
      db_suffix      = "sports-part"
      url_env_name   = "SPORTS_PARTICIPATION_URL"
      path_patterns  = ["/sports-participations*", "/sports-parts*"]
    }
    "event-config-service" = {
      port           = 8005
      health_path    = "/health"
      tg_suffix      = "evt"
      redis_db_index = 4
      db_suffix      = "event-config"
      url_env_name   = "EVENT_CONFIGURATION_URL"
      path_patterns  = ["/event-configurations*", "/event-configs*"]
    }
    "scheduling-service" = {
      port           = 8006
      health_path    = "/health"
      tg_suffix      = "sch"
      redis_db_index = 5
      db_suffix      = "scheduling"
      url_env_name   = "SCHEDULING_URL"
      path_patterns  = ["/schedulings*"]
    }
    "scoring-service" = {
      port           = 8007
      health_path    = "/health"
      tg_suffix      = "sco"
      redis_db_index = 6
      db_suffix      = "scoring"
      url_env_name   = "SCORING_URL"
      path_patterns  = ["/scorings*"]
    }
    "reporting-service" = {
      port           = 8008
      health_path    = "/health"
      tg_suffix      = "rep"
      redis_db_index = 7
      db_suffix      = "reporting"
      url_env_name   = "REPORTING_URL"
      path_patterns  = ["/reportings*"]
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  services = {
    "identity-service" = { port = 8001, health_path = "/health" }
    "enrollment-service" = { port = 8002, health_path = "/health" }
    "department-service" = { port = 8003, health_path = "/health" }
    "sports-participation-service" = { port = 8004, health_path = "/health" }
    "event-configuration-service" = { port = 8005, health_path = "/health" }
    "scheduling-service" = { port = 8006, health_path = "/health" }
    "scoring-service" = { port = 8007, health_path = "/health" }
    "reporting-service" = { port = 8008, health_path = "/health" }
  }

  redis_db_index = {
    "identity-service"             = 0
    "enrollment-service"           = 1
    "department-service"           = 2
    "sports-participation-service" = 3
    "event-configuration-service"  = 4
    "scheduling-service"           = 5
    "scoring-service"              = 6
    "reporting-service"            = 7
  }

  ecr_repos = keys(local.services)
  image_prefix = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  name_prefix = var.name_prefix
  alb_name    = "${local.name_prefix}-alb"
  ecs_tasks_name = "${local.name_prefix}-ecs-tasks"
  redis_name     = "${local.name_prefix}-redis"
  tg_names = {
    "identity-service"             = "id"
    "enrollment-service"           = "enr"
    "department-service"           = "dep"
    "sports-participation-service" = "sp"
    "event-configuration-service"  = "evt"
    "scheduling-service"           = "sch"
    "scoring-service"              = "sco"
    "reporting-service"            = "rep"
  }
  has_route53_zone     = var.route53_zone_id != ""

  service_url_env = {
    IDENTITY_URL             = "http://identity-service.${var.service_discovery_namespace}:8001"
    ENROLLMENT_URL           = "http://enrollment-service.${var.service_discovery_namespace}:8002"
    DEPARTMENT_URL           = "http://department-service.${var.service_discovery_namespace}:8003"
    SPORTS_PARTICIPATION_URL = "http://sports-participation-service.${var.service_discovery_namespace}:8004"
    EVENT_CONFIGURATION_URL  = "http://event-configuration-service.${var.service_discovery_namespace}:8005"
    SCHEDULING_URL           = "http://scheduling-service.${var.service_discovery_namespace}:8006"
    SCORING_URL              = "http://scoring-service.${var.service_discovery_namespace}:8007"
    REPORTING_URL            = "http://reporting-service.${var.service_discovery_namespace}:8008"
  }

  common_env = {
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.app_env
    LOG_LEVEL        = var.log_level
  }

  mongo_env = {
    for name, _ in local.services :
    name => {
      DATABASE_NAME = var.database_names[name]
    }
  }

  redis_env = {
    for name, index in local.redis_db_index :
    name => {
      REDIS_URL = "${local.redis_base_url}/${index}"
    }
  }

  identity_env = {
    EMAIL_PROVIDER  = var.email_provider
    GMAIL_USER      = var.gmail_user
    SENDGRID_USER   = var.sendgrid_user
    SMTP_HOST       = var.smtp_host
    SMTP_USER       = var.smtp_user
    SMTP_PORT       = tostring(var.smtp_port)
    SMTP_SECURE     = tostring(var.smtp_secure)
    EMAIL_FROM      = var.email_from
    EMAIL_FROM_NAME = var.email_from_name
    APP_NAME        = var.app_name
  }

  service_env = {
    for name, _ in local.services :
    name => merge(
      local.service_url_env,
      local.common_env,
      local.mongo_env[name],
      local.redis_env[name],
      name == "identity-service" ? local.identity_env : {}
    )
  }

  base_secret_env = [
    {
      name      = "JWT_SECRET"
      valueFrom = aws_secretsmanager_secret.jwt_secret.arn
    }
  ]

  mongo_secret_env = [
    {
      name      = "MONGODB_URI"
      valueFrom = aws_secretsmanager_secret.mongo_uri.arn
    }
  ]

  identity_secret_env = [
    {
      name      = "GMAIL_APP_PASSWORD"
      valueFrom = aws_secretsmanager_secret.gmail_app_password.arn
    },
    {
      name      = "SENDGRID_API_KEY"
      valueFrom = aws_secretsmanager_secret.sendgrid_api_key.arn
    },
    {
      name      = "RESEND_API_KEY"
      valueFrom = aws_secretsmanager_secret.resend_api_key.arn
    },
    {
      name      = "SMTP_PASSWORD"
      valueFrom = aws_secretsmanager_secret.smtp_password.arn
    }
  ]

  service_secrets = {
    for name, _ in local.services :
    name => concat(
      local.base_secret_env,
      local.mongo_secret_env,
      name == "identity-service" ? local.identity_secret_env : []
    )
  }

  redis_base_url = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "${local.name_prefix}-vpc"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets

  enable_nat_gateway = true
  single_nat_gateway = true
}

resource "aws_ecr_repository" "repos" {
  for_each = toset(local.ecr_repos)
  name     = "${local.name_prefix}-${each.key}"
  force_delete = true
}

resource "aws_ecs_cluster" "cluster" {
  name = var.cluster_name
}

resource "aws_service_discovery_private_dns_namespace" "namespace" {
  name = var.service_discovery_namespace
  vpc  = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "services" {
  for_each = local.services
  name     = each.key
  force_destroy = true

  lifecycle {
    ignore_changes = [health_check_custom_config]
  }

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.namespace.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
}

resource "aws_security_group" "alb" {
  name        = local.alb_name
  description = "ALB security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "ecs_tasks" {
  name        = local.ecs_tasks_name
  description = "ECS tasks security group"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_tasks_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
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
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn == "" ? 0 : 1
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
  listener_arn = var.acm_certificate_arn == "" ? aws_lb_listener.http.arn : aws_lb_listener.https[0].arn
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

resource "aws_cloudwatch_log_group" "services" {
  for_each = local.services
  name     = "/ecs/${local.name_prefix}/${each.key}"
  retention_in_days = 14
}

resource "aws_iam_role" "task_execution" {
  name = "${local.name_prefix}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = var.jwt_secret_name
}

resource "aws_secretsmanager_secret" "mongo_uri" {
  name = var.mongo_uri_secret_name
}

resource "aws_secretsmanager_secret" "gmail_app_password" {
  name = var.gmail_app_password_secret_name
}

resource "aws_secretsmanager_secret" "sendgrid_api_key" {
  name = var.sendgrid_api_key_secret_name
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name = var.resend_api_key_secret_name
}

resource "aws_secretsmanager_secret" "smtp_password" {
  name = var.smtp_password_secret_name
}

resource "aws_iam_policy" "secrets_access" {
  name        = "${local.name_prefix}-secrets-access"
  description = "Allow ECS task execution to read Secrets Manager values."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_secrets" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.secrets_access.arn
}

resource "aws_iam_role" "task_role" {
  name = "${local.name_prefix}-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_policy" "ecs_exec" {
  name        = "${local.name_prefix}-ecs-exec"
  description = "Allow ECS Exec via SSM."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_role_ecs_exec" {
  role       = aws_iam_role.task_role.name
  policy_arn = aws_iam_policy.ecs_exec.arn
}

resource "aws_ecs_task_definition" "services" {
  for_each             = local.services
  family               = "${local.name_prefix}-${each.key}"
  network_mode         = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                  = tostring(var.service_cpu)
  memory               = tostring(var.service_memory)
  execution_role_arn   = aws_iam_role.task_execution.arn
  task_role_arn        = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${local.image_prefix}/${local.name_prefix}-${each.key}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = each.value.port
          hostPort      = each.value.port
          protocol      = "tcp"
        }
      ]
      environment = [
        for k, v in local.service_env[each.key] : {
          name  = k
          value = v
        }
      ]
      secrets = [
        for secret in local.service_secrets[each.key] : {
          name      = secret.name
          valueFrom = secret.valueFrom
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "services" {
  for_each        = local.services
  name            = "${local.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.cluster.id
  task_definition = aws_ecs_task_definition.services[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  enable_execute_command = true
  platform_version      = "LATEST"
  force_new_deployment  = true

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services[each.key].arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  depends_on = [aws_lb_listener.http]
}

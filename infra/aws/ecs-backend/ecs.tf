resource "aws_ecs_task_definition" "services" {
  for_each             = local.services
  family               = "${local.name_prefix}-${each.key}"
  network_mode         = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                  = tostring(local.service_cpu[each.key])
  memory               = tostring(local.service_memory[each.key])
  execution_role_arn   = aws_iam_role.task_execution.arn
  task_role_arn        = aws_iam_role.task_role[each.key].arn

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
      healthCheck = {
        command     = ["CMD-SHELL", "curl -fsS http://localhost:${each.value.port}/health > /dev/null"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      ulimits = [
        {
          name      = "nofile"
          softLimit = var.ulimit_nofile_soft
          hardLimit = var.ulimit_nofile_hard
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
  desired_count   = var.autoscale_min
  launch_type     = "FARGATE"
  enable_execute_command = true
  platform_version      = "LATEST"
  force_new_deployment  = var.force_new_deployment
  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent
  
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

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

  depends_on = [aws_lb_listener.https]
}

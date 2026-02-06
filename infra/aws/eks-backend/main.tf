provider "aws" {
  region = var.aws_region
}

locals {
  services = {
    "identity-service" = { port = 8001 }
    "enrollment-service" = { port = 8002 }
    "department-service" = { port = 8003 }
    "sports-participation-service" = { port = 8004 }
    "event-configuration-service" = { port = 8005 }
    "scheduling-service" = { port = 8006 }
    "scoring-service" = { port = 8007 }
    "reporting-service" = { port = 8008 }
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

  service_url_env = {
    IDENTITY_URL             = "http://identity-service:8001"
    ENROLLMENT_URL           = "http://enrollment-service:8002"
    DEPARTMENT_URL           = "http://department-service:8003"
    SPORTS_PARTICIPATION_URL = "http://sports-participation-service:8004"
    EVENT_CONFIGURATION_URL  = "http://event-configuration-service:8005"
    SCHEDULING_URL           = "http://scheduling-service:8006"
    SCORING_URL              = "http://scoring-service:8007"
    REPORTING_URL            = "http://reporting-service:8008"
  }

  common_env = {
    JWT_SECRET       = var.jwt_secret
    JWT_EXPIRES_IN   = var.jwt_expires_in
    ADMIN_REG_NUMBER = var.admin_reg_number
    APP_ENV          = var.app_env
    LOG_LEVEL        = var.log_level
  }

  mongo_env = {
    for name, _ in local.services :
    name => {
      MONGODB_URI  = var.mongo_uri
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
    EMAIL_PROVIDER     = var.email_provider
    GMAIL_USER         = var.gmail_user
    GMAIL_APP_PASSWORD = var.gmail_app_password
    SENDGRID_USER      = var.sendgrid_user
    SENDGRID_API_KEY   = var.sendgrid_api_key
    RESEND_API_KEY     = var.resend_api_key
    SMTP_HOST          = var.smtp_host
    SMTP_USER          = var.smtp_user
    SMTP_PASSWORD      = var.smtp_password
    SMTP_PORT          = tostring(var.smtp_port)
    SMTP_SECURE        = tostring(var.smtp_secure)
    EMAIL_FROM         = var.email_from
    EMAIL_FROM_NAME    = var.email_from_name
    APP_NAME           = var.app_name
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

  image_prefix = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  redis_base_url = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.port}"
  redis_url      = local.redis_base_url

  name_prefix     = substr(var.cluster_name, 0, 12)
  redis_name      = "${local.name_prefix}-redis"
  alb_controller_name = "${local.name_prefix}-alb-controller"

  api_paths = [
    { path = "/identities", service = "identity-service", port = 8001 },
    { path = "/enrollments", service = "enrollment-service", port = 8002 },
    { path = "/departments", service = "department-service", port = 8003 },
    { path = "/sports-participations", service = "sports-participation-service", port = 8004 },
    { path = "/event-configurations", service = "event-configuration-service", port = 8005 },
    { path = "/schedulings", service = "scheduling-service", port = 8006 },
    { path = "/scorings", service = "scoring-service", port = 8007 },
    { path = "/reportings", service = "reporting-service", port = 8008 }
  ]

  ingress_hosts = {
    for host in compact([var.api_domain]) :
    host => host
  }

  alb_annotations = merge(
    {
      "kubernetes.io/ingress.class"            = "alb"
      "alb.ingress.kubernetes.io/scheme"       = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"  = "ip"
    },
    var.acm_certificate_arn != "" ? {
      "alb.ingress.kubernetes.io/certificate-arn" = var.acm_certificate_arn
      "alb.ingress.kubernetes.io/listen-ports"    = "[{\"HTTP\":80},{\"HTTPS\":443}]"
      "alb.ingress.kubernetes.io/ssl-redirect"    = "443"
    } : {
      "alb.ingress.kubernetes.io/listen-ports"    = "[{\"HTTP\":80}]"
    }
  )
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.cluster_name
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets

  enable_nat_gateway = true
  single_nat_gateway = true
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = var.cluster_name
  kubernetes_version = "1.29"

  subnet_ids = module.vpc.private_subnets
  vpc_id     = module.vpc.vpc_id

  enable_irsa = true

  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    default = {
      instance_types = var.node_instance_types
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      desired_size   = var.node_desired_size
    }
  }
}

resource "aws_ecr_repository" "repos" {
  for_each = toset(local.ecr_repos)
  name     = "annual-sports-${each.key}"
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = local.redis_name
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name        = local.redis_name
  description = "Redis access from EKS nodes"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group_rule" "redis_ingress" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = module.eks.node_security_group_id
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

data "aws_eks_cluster" "cluster" {
  name = module.eks.cluster_name
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

resource "aws_iam_policy" "alb_controller" {
  name   = local.alb_controller_name
  policy = file("${path.module}/alb-controller-policy.json")
}

data "aws_iam_policy_document" "alb_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role" "alb_controller" {
  name               = local.alb_controller_name
  assume_role_policy = data.aws_iam_policy_document.alb_assume.json
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  role       = aws_iam_role.alb_controller.name
  policy_arn = aws_iam_policy.alb_controller.arn
}

resource "kubernetes_service_account_v1" "alb_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.alb_controller.arn
    }
  }
}

resource "helm_release" "alb_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = var.cluster_name
  }
  set {
    name  = "serviceAccount.create"
    value = "false"
  }
  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account_v1.alb_controller.metadata[0].name
  }
  set {
    name  = "region"
    value = var.aws_region
  }
  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }
}

resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = "annual-sports"
  }
}

resource "kubernetes_secret_v1" "service_env" {
  for_each = local.services
  metadata {
    name      = "${each.key}-env"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  type        = "Opaque"
  string_data = local.service_env[each.key]
}

resource "kubernetes_deployment_v1" "services" {
  for_each = local.services
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    labels = {
      app = each.key
    }
  }
  spec {
    replicas = 1
    selector {
      match_labels = {
        app = each.key
      }
    }
    template {
      metadata {
        labels = {
          app = each.key
        }
      }
      spec {
        container {
          name  = each.key
          image = "${local.image_prefix}/annual-sports-${each.key}:${var.image_tag}"
          port {
            container_port = each.value.port
          }
          env_from {
            secret_ref {
              name = kubernetes_secret_v1.service_env[each.key].metadata[0].name
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "services" {
  for_each = local.services
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    labels = {
      app = each.key
    }
  }
  spec {
    type = "ClusterIP"
    selector = {
      app = each.key
    }
    port {
      port        = each.value.port
      target_port = each.value.port
    }
  }
}

resource "kubernetes_ingress_v1" "alb" {
  metadata {
    name      = "annual-sports-ingress"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    annotations = local.alb_annotations
  }

  spec {
    ingress_class_name = "alb"

    dynamic "rule" {
      for_each = local.ingress_hosts
      content {
        host = rule.key
        http {
          dynamic "path" {
            for_each = local.api_paths
            content {
              path      = path.value.path
              path_type = "Prefix"
              backend {
                service {
                  name = path.value.service
                  port {
                    number = path.value.port
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.alb_controller]
}

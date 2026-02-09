resource "kubernetes_namespace_v1" "keda" {
  metadata {
    name = "keda"
  }
}

data "aws_iam_policy_document" "keda_assume" {
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
      values   = ["system:serviceaccount:keda:keda-operator"]
    }
  }
}

resource "aws_iam_role" "keda" {
  name               = "${local.name_prefix}-keda"
  assume_role_policy = data.aws_iam_policy_document.keda_assume.json
}

resource "aws_iam_policy" "keda_cloudwatch" {
  name        = "${local.name_prefix}-keda-cloudwatch"
  description = "Allow KEDA to read CloudWatch metrics for scaling."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "cloudwatch:DescribeAlarms"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "keda_cloudwatch" {
  role       = aws_iam_role.keda.name
  policy_arn = aws_iam_policy.keda_cloudwatch.arn
}

resource "kubernetes_service_account_v1" "keda" {
  metadata {
    name      = "keda-operator"
    namespace = kubernetes_namespace_v1.keda.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.keda.arn
    }
  }
}

resource "helm_release" "keda" {
  name       = "keda"
  repository = "https://kedacore.github.io/charts"
  chart      = "keda"
  namespace  = kubernetes_namespace_v1.keda.metadata[0].name

  set {
    name  = "serviceAccount.create"
    value = "false"
  }
  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account_v1.keda.metadata[0].name
  }
}

data "aws_lb" "app" {
  name       = local.alb_name
  depends_on = [kubernetes_ingress_v1.alb]
}

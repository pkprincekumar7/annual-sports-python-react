data "aws_iam_policy_document" "service_assume_role" {
  for_each = local.services
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
      values   = ["system:serviceaccount:${kubernetes_namespace_v1.app.metadata[0].name}:${each.key}"]
    }
  }
}

resource "aws_iam_role" "service_irsa" {
  for_each           = local.services
  name               = "${local.name_prefix}-${each.key}-irsa"
  assume_role_policy = data.aws_iam_policy_document.service_assume_role[each.key].json
}

resource "aws_iam_policy" "app_s3_access" {
  count       = var.app_s3_bucket_name != "" ? 1 : 0
  name        = "${local.name_prefix}-app-s3-access"
  description = "Allow EKS pods to read/write app S3 bucket."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.app_s3_bucket_name}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.app_s3_bucket_name}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "service_irsa_s3" {
  for_each   = var.app_s3_bucket_name != "" ? local.services : {}
  role       = aws_iam_role.service_irsa[each.key].name
  policy_arn = aws_iam_policy.app_s3_access[0].arn
}

resource "kubernetes_service_account_v1" "services" {
  for_each = local.services
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.service_irsa[each.key].arn
    }
  }
}

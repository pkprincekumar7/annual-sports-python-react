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

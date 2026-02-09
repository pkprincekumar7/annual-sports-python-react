resource "aws_ecr_repository" "repos" {
  for_each = toset(local.ecr_repos)
  name     = "${local.name_prefix}-${each.key}"
}

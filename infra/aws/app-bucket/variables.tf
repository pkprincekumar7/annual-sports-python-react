variable "aws_region" {
  type        = string
  description = "AWS region for the app bucket (use bucket region)."
  validation {
    condition     = var.aws_region != ""
    error_message = "aws_region must be set."
  }
}

variable "bucket_name" {
  type        = string
  description = "Existing global app bucket name."
}

variable "task_role_arns" {
  type        = list(string)
  description = "ECS task role ARNs allowed to access the app bucket."
  validation {
    condition     = length(var.task_role_arns) > 0
    error_message = "task_role_arns must include at least one role ARN."
  }
}

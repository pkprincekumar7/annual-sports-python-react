# AWS App S3 Bucket Policy

This stack attaches a bucket policy to the global application bucket to allow
access from ECS task roles across regions.

## Prerequisites
- Terraform 1.13+
- Existing S3 bucket (`app_s3_bucket_name`) created manually or via separate stack

## Example tfvars
```hcl
aws_region  = "us-east-1"
bucket_name = "your-app-bucket"

task_role_arns = [
  "arn:aws:iam::123456789012:role/as-dev-us-east-1-identity-service-task-role",
  "arn:aws:iam::123456789012:role/as-dev-eu-west-1-enrollment-service-task-role"
]
```

## Notes
- Only the bucket policy is managed here; bucket configuration (versioning,
  encryption, CORS, lifecycle) should be set where the bucket is created.
- Apply this stack after regional `ecs-backend` outputs are available
  (`task_role_arns`).

## Outputs Used by Other Stacks
- `bucket_name` and `bucket_arn` for validation or IAM policy references
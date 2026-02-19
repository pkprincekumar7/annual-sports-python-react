bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/<app-prefix>/qa/ecs-backend/<aws-region>/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

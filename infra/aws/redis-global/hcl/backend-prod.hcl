bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/<app-prefix>/prod/redis-global/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

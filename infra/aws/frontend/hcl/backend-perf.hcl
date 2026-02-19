bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/<app-prefix>/perf/frontend/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

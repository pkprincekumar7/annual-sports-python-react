bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/as/prod/app-bucket/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/annual-sports/stg/frontend/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

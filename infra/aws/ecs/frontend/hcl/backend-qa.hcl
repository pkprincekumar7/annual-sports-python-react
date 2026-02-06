bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/annual-sports/qa/ecs/frontend/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

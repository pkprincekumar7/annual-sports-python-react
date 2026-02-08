bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/annual-sports/dev/ecs-backend/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

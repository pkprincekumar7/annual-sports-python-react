bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/annual-sports/perf/ecs-backend/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

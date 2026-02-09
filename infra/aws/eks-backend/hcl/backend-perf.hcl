bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/annual-sports/perf/eks-backend/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

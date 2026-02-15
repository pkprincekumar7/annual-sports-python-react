bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/as/perf/app-bucket/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

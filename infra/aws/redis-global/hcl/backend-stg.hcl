bucket         = "your-terraform-state-bucket"
key            = "terraform-state-files/as/stg/redis-global/us-east-1/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "terraform-locks"
encrypt        = true

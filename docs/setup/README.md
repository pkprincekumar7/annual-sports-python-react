# Setup

This folder contains setup-focused documentation for the new microservices structure.

## Start here
- `env-setup.md` - Copy `.env.example` files and fill secret values

## Ubuntu (Linux)
- `ubuntu/quick-start.md` - Local setup and running the app
- `ubuntu/docker-engine-install.md` - Install Docker Engine + Compose
- `ubuntu/docker-compose.md` - Run the full stack with Compose
- `ubuntu/systemd-frontend.md` - Frontend as a systemd service
- `ubuntu/systemd-backend.md` - Backend systemd overview (microservices)
- `ubuntu/systemd-identity-service.md` - Identity service systemd unit
- `ubuntu/systemd-enrollment-service.md` - Enrollment service systemd unit
- `ubuntu/systemd-department-service.md` - Department service systemd unit
- `ubuntu/systemd-sports-participation-service.md` - Sports participation systemd unit
- `ubuntu/systemd-event-configuration-service.md` - Event configuration systemd unit
- `ubuntu/systemd-scheduling-service.md` - Scheduling service systemd unit
- `ubuntu/systemd-scoring-service.md` - Scoring service systemd unit
- `ubuntu/systemd-reporting-service.md` - Reporting service systemd unit
- `ubuntu/nginx-reverse-proxy.md` - Nginx reverse proxy for frontend + microservices
- `ubuntu/nginx-https.md` - HTTPS for frontend + microservices with Nginx + Certbot
- `ubuntu/kubernetes-prereqs.md` - Kubernetes prerequisites (kubectl, minikube/k3s)
- `ubuntu/kubernetes.md` - Kubernetes deployment (frontend + microservices)
- `ubuntu/kubectl-port-forward-systemd.md` - kubectl port-forward as a service
- `ubuntu/troubleshooting.md` - Common service and port issues

## Windows
- `windows/quick-start.md` - Local setup and running the app
- `windows/docker-desktop.md` - Install Docker Desktop + WSL2
- `windows/docker-compose.md` - Run the full stack with Compose
- `windows/services.md` - Run frontend/backend as Windows services (NSSM)

## macOS
- `macos/quick-start.md` - Local setup and running the app
- `macos/docker-desktop.md` - Install Docker Desktop
- `macos/docker-compose.md` - Run the full stack with Compose
- `macos/launchd-services.md` - Run frontend/backend as launchd services

## Other Deployment Options
- `other-options.md` - Static hosting, PaaS, Docker without Compose, Kubernetes

## AWS
- `aws/eks.md` - AWS EKS deployment (ECR, ALB, TLS)
- `../infra/aws/eks/README.md` - AWS EKS with Terraform (infra + ALB)
- `aws/ecs.md` - AWS ECS Fargate deployment (ALB, TLS)
- `../infra/aws/ecs/backend/README.md` - AWS ECS Fargate with Terraform (backend)
- `../infra/aws/ecs/frontend/README.md` - AWS Frontend with Terraform (S3 + CloudFront)

## Azure
- `azure/aks.md` - Azure AKS deployment (Terraform entry point)
- `../infra/azure/aks/README.md` - Azure AKS with Terraform
- `azure/container-apps.md` - Azure Container Apps deployment (Terraform entry point)
- `../infra/azure/aca/README.md` - Azure Container Apps with Terraform

## GCP
- `gcp/gke.md` - Google Kubernetes Engine (GKE) deployment (Terraform entry point)
- `../infra/gcp/gke/README.md` - GKE with Terraform
- `gcp/cloud-run.md` - Cloud Run deployment (Terraform entry point)
- `../infra/gcp/cloud-run/README.md` - Cloud Run with Terraform

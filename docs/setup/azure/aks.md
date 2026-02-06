# Azure AKS Deployment (Frontend + Microservices)

This guide deploys the app to Azure Kubernetes Service (AKS):
- ACR for images
- AKS for workloads
- NGINX Ingress for routing
- Azure DNS + TLS

It assumes you already have a domain and can create DNS records.

## Prerequisites
- Azure subscription with permissions for AKS, ACR, and networking
- Azure CLI installed (`az login`)
- `kubectl` and `helm` installed
- Docker installed
- Python 3.12+ and Node.js 24+ for local builds
- A domain you control (Azure DNS or external DNS)

## 1) Configure Azure CLI

```bash
az login
az account set --subscription "<subscription-id>"
```

## 2) Terraform (Recommended)

Terraform for AKS lives in:

`new-structure/infra/azure/aks`

Quick start:

```bash
cd new-structure/infra/azure/aks
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Then continue with image build/push and verification below.

## 3) Create ACR

```bash
az group create --name rg-annual-sports --location eastus
az acr create \
  --resource-group rg-annual-sports \
  --name annualsportsacr \
  --sku Basic
```

Get the login server:

```bash
az acr show --name annualsportsacr --query loginServer -o tsv
```

## 4) Build and Push Images

```bash
ACR_LOGIN_SERVER=<your-acr-login-server>
az acr login --name annualsportsacr
```

```bash
for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  docker build -t "annual-sports-${service}:latest" "new-structure/$service"
  docker tag "annual-sports-${service}:latest" \
    "$ACR_LOGIN_SERVER/annual-sports-${service}:latest"
  docker push "$ACR_LOGIN_SERVER/annual-sports-${service}:latest"
done

docker build -t annual-sports-frontend:latest \
  --build-arg VITE_API_URL=/ \
  new-structure/frontend
docker tag annual-sports-frontend:latest \
  "$ACR_LOGIN_SERVER/annual-sports-frontend:latest"
docker push "$ACR_LOGIN_SERVER/annual-sports-frontend:latest"
```

`VITE_API_URL` is a build-time value; changing it requires a rebuild.

## 5) Create AKS Cluster

```bash
az aks create \
  --resource-group rg-annual-sports \
  --name aks-annual-sports \
  --node-count 2 \
  --node-vm-size Standard_B4ms \
  --enable-managed-identity \
  --attach-acr annualsportsacr \
  --generate-ssh-keys
```

Get credentials:

```bash
az aks get-credentials --resource-group rg-annual-sports --name aks-annual-sports
```

## 6) Install NGINX Ingress

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

## 7) Create Namespace, Config, and Secrets

```bash
kubectl create namespace annual-sports
```

Create ConfigMaps for non-secret values and Secrets for sensitive values. Non-secrets should match `x-common-env` in `new-structure/docker-compose.yml`. Secrets (MongoDB URI, JWT secret, email credentials) should come from Azure Key Vault or Kubernetes Secrets.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/annual-sports-config.yaml
kubectl -n annual-sports create secret generic annual-sports-secrets \
  --from-literal=MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-identity" \
  --from-literal=JWT_SECRET="your-strong-secret"

kubectl -n annual-sports create secret generic identity-secrets \
  --from-literal=GMAIL_APP_PASSWORD="your-16-char-app-password" \
  --from-literal=SENDGRID_API_KEY="your-sendgrid-api-key" \
  --from-literal=RESEND_API_KEY="your-resend-api-key" \
  --from-literal=SMTP_PASSWORD="your-smtp-password"
```

## 8) Redis and MongoDB

Redis is required for caching. Use **Azure Cache for Redis** in production and set `REDIS_URL` for each service.
If you want in-cluster Redis for testing, apply `new-structure/docs/setup/ubuntu/k8s/redis.yaml`.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/redis.yaml
```

MongoDB is optional if you use Azure Cosmos DB (Mongo API) or MongoDB Atlas. For in-cluster MongoDB:

```bash
kubectl apply -f mongodb.yaml
kubectl -n annual-sports rollout status statefulset/mongodb
```

## 9) Deploy Services and Frontend

Create one Deployment/Service per microservice using the manifests in `new-structure/docs/setup/ubuntu/k8s`,
then apply the frontend manifest. AKS uses NGINX Ingress path routing; do not use the NGINX gateway.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/identity-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/enrollment-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/department-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/sports-participation-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/event-configuration-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/scheduling-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/scoring-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/reporting-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/frontend.yaml

kubectl -n annual-sports rollout status deploy/identity-service
kubectl -n annual-sports rollout status deploy/annual-sports-frontend
```

## 10) Ingress + TLS

Create an `ingress.yaml` (NGINX example), replace the hosts and certificate, then apply it:

```bash
cat <<'EOF' > ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: annual-sports-ingress
  namespace: annual-sports
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  tls:
    - hosts:
        - your-domain.com
      secretName: annual-sports-tls
  rules:
    - host: your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: annual-sports-frontend
                port:
                  number: 80
          - path: /identities
            pathType: Prefix
            backend:
              service:
                name: identity-service
                port:
                  number: 8001
          - path: /enrollments
            pathType: Prefix
            backend:
              service:
                name: enrollment-service
                port:
                  number: 8002
          - path: /departments
            pathType: Prefix
            backend:
              service:
                name: department-service
                port:
                  number: 8003
          - path: /sports-participations
            pathType: Prefix
            backend:
              service:
                name: sports-participation-service
                port:
                  number: 8004
          - path: /event-configurations
            pathType: Prefix
            backend:
              service:
                name: event-configuration-service
                port:
                  number: 8005
          - path: /schedulings
            pathType: Prefix
            backend:
              service:
                name: scheduling-service
                port:
                  number: 8006
          - path: /scorings
            pathType: Prefix
            backend:
              service:
                name: scoring-service
                port:
                  number: 8007
          - path: /reportings
            pathType: Prefix
            backend:
              service:
                name: reporting-service
                port:
                  number: 8008
    - host: api.your-domain.com
      http:
        paths:
          - path: /identities
            pathType: Prefix
            backend:
              service:
                name: identity-service
                port:
                  number: 8001
          - path: /enrollments
            pathType: Prefix
            backend:
              service:
                name: enrollment-service
                port:
                  number: 8002
          - path: /departments
            pathType: Prefix
            backend:
              service:
                name: department-service
                port:
                  number: 8003
          - path: /sports-participations
            pathType: Prefix
            backend:
              service:
                name: sports-participation-service
                port:
                  number: 8004
          - path: /event-configurations
            pathType: Prefix
            backend:
              service:
                name: event-configuration-service
                port:
                  number: 8005
          - path: /schedulings
            pathType: Prefix
            backend:
              service:
                name: scheduling-service
                port:
                  number: 8006
          - path: /scorings
            pathType: Prefix
            backend:
              service:
                name: scoring-service
                port:
                  number: 8007
          - path: /reportings
            pathType: Prefix
            backend:
              service:
                name: reporting-service
                port:
                  number: 8008
EOF

kubectl apply -f ingress.yaml
```

Use cert-manager or upload TLS certs to a Kubernetes secret.

## 11) DNS Setup

Create DNS records for your domain(s) pointing to the ingress public IP.

## 12) Verify

```bash
curl -I https://your-domain.com
curl -I https://your-domain.com/identities/docs
```

## Manual Setup (Portal)

Use Azure Portal to:
- Create ACR
- Create AKS (attach ACR)
- Install ingress
- Create DNS records
- Upload TLS certs or configure cert-manager

Then deploy with `kubectl`.

## Teardown

```bash
az group delete --name rg-annual-sports --yes --no-wait
```

## Best Practices Notes
- Use Cosmos DB (Mongo API) or MongoDB Atlas for production.
- Store secrets in Azure Key Vault and sync to Kubernetes.
- Use ClusterIP for services; only the ingress should be public.
- Pin image tags and enable ACR image scanning.

## Terraform Option

If you want Infrastructure as Code, use `infra/azure/aks/README.md`.

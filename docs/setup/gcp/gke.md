# Google Cloud GKE Deployment (Frontend + Microservices)

This guide deploys the app to Google Kubernetes Engine (GKE):
- Artifact Registry for images
- GKE for workloads
- Ingress for routing
- Cloud DNS + managed TLS

## Prerequisites
- GCP project with billing enabled
- `gcloud` installed and authenticated
- `kubectl` installed
- Docker installed
- Python 3.12+ and Node.js 24+ for local builds
- A domain you control (Cloud DNS or external DNS)

## 1) Set Project and Region

```bash
gcloud config set project <your-project-id>
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a
```

## 2) Terraform (Recommended)

Terraform for GKE lives in:

`new-structure/infra/gcp/gke`

Quick start:

```bash
cd new-structure/infra/gcp/gke
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Then continue with image build/push and verification below.

## 3) Create Artifact Registry

```bash
gcloud artifacts repositories create annual-sports \
  --repository-format=docker \
  --location=us-central1 \
  --description="Annual Sports images"
```

Configure Docker auth:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## 4) Build and Push Images

```bash
PROJECT_ID=<your-project-id>
REGION=us-central1
REPO=annual-sports
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
    "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-${service}:latest"
  docker push "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-${service}:latest"
done

docker build -t annual-sports-frontend:latest \
  --build-arg VITE_API_URL=/ \
  new-structure/frontend
docker tag annual-sports-frontend:latest \
  "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-frontend:latest"
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-frontend:latest"
```

`VITE_API_URL` is a build-time value; changing it requires a rebuild.

## 5) Create GKE Cluster

```bash
gcloud container clusters create annual-sports \
  --region us-central1 \
  --num-nodes 2 \
  --machine-type e2-standard-2
```

Get credentials:

```bash
gcloud container clusters get-credentials annual-sports --region us-central1
```

## 6) Create Namespace, Config, and Secrets

```bash
kubectl create namespace annual-sports
```

Create ConfigMaps for non-secret values and Secrets for sensitive values. Non-secrets should match `x-common-env` in `new-structure/docker-compose.yml`. Secrets (MongoDB URI, JWT secret, email credentials) should come from Secret Manager or Kubernetes Secrets.

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

## 7) Deploy Redis and MongoDB

Redis is required for caching. Use **Memorystore for Redis** in production and set `REDIS_URL` for each service.
If you want in-cluster Redis for testing, apply `new-structure/docs/setup/ubuntu/k8s/redis.yaml`.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/redis.yaml
```

MongoDB is optional if you use MongoDB Atlas. For in-cluster MongoDB:

```bash
kubectl apply -f mongodb.yaml
kubectl -n annual-sports rollout status statefulset/mongodb
```

## 8) Deploy Services and Frontend

Create one Deployment/Service per microservice using the manifests in `new-structure/docs/setup/ubuntu/k8s`,
then apply the frontend manifest. GKE uses GCE Ingress path routing; do not use the NGINX gateway.

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

## 9) Ingress + TLS

Create an `ingress.yaml`, replace the hosts, then apply it:

```bash
cat <<'EOF' > ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: annual-sports-ingress
  namespace: annual-sports
  annotations:
    kubernetes.io/ingress.class: "gce"
spec:
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

Create a managed certificate (optional but recommended):

```yaml
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: annual-sports-cert
  namespace: annual-sports
spec:
  domains:
    - your-domain.com
```

Attach it by adding annotation:

```yaml
metadata:
  annotations:
    networking.gke.io/managed-certificates: annual-sports-cert
```

## 10) DNS Setup

Point `your-domain.com` to the load balancer IP from the ingress.

## 11) Verify

```bash
curl -I https://your-domain.com
curl -I https://your-domain.com/identities/docs
```

## Manual Setup (Console)

Use Cloud Console to:
- Create Artifact Registry
- Create GKE cluster
- Create DNS records
- Configure HTTPS load balancer

Then deploy with `kubectl`.

## Teardown

```bash
gcloud container clusters delete annual-sports --region us-central1
```

Delete Artifact Registry:

```bash
gcloud artifacts repositories delete annual-sports --location us-central1
```

## Best Practices Notes
- Use MongoDB Atlas and Memorystore for production.
- Store secrets in Secret Manager and sync to Kubernetes.
- Use ClusterIP for services; only the ingress should be public.
- Pin image tags and enable image scanning.

## Terraform Option

If you want Infrastructure as Code, use `infra/gcp/gke/README.md`.

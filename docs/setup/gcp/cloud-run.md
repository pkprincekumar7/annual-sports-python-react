# Google Cloud Run Deployment (Frontend + Microservices)

This guide deploys the app to Cloud Run:
- Artifact Registry for images
- Cloud Run services for workloads
- Internal-only microservices
- A public API gateway and frontend

## Prerequisites
- GCP project with billing enabled
- `gcloud` authenticated
- Docker installed
- Python 3.12+ and Node.js 24+ for local builds
- A domain you control

## 1) Terraform (Recommended)

Terraform for Cloud Run lives in:

`new-structure/infra/gcp/cloud-run`

Quick start:

```bash
cd new-structure/infra/gcp/cloud-run
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Then continue with image build/push and verification below.

## 2) Create Artifact Registry

```bash
gcloud config set project <your-project-id>
gcloud artifacts repositories create annual-sports \
  --repository-format=docker \
  --location=us-central1 \
  --description="Annual Sports images"
```

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## 3) Build and Push Images

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

## 4) (Optional) Create a Gateway Service Account

If you want IAM-authenticated calls from the gateway to the internal services,
create a service account and grant it `roles/run.invoker`. Otherwise, you can
use `--allow-unauthenticated` for the internal services while keeping
`--ingress internal`.

```bash
gcloud iam service-accounts create annual-sports-gateway \
  --display-name "Annual Sports API Gateway"
```

## 5) Deploy Internal Microservices

Provision Redis (Memorystore) and MongoDB (Atlas). Set `REDIS_URL` and `MONGODB_URI` for each service.

```bash
gcloud run deploy identity-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-identity-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8001 \
  --set-env-vars PORT=8001 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-identity" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/0"

gcloud run deploy enrollment-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-enrollment-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8002 \
  --set-env-vars PORT=8002 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-enrollment" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/1"

gcloud run deploy department-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-department-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8003 \
  --set-env-vars PORT=8003 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-department" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/2"

gcloud run deploy sports-participation-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-sports-participation-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8004 \
  --set-env-vars PORT=8004 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-participation" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/3"

gcloud run deploy event-configuration-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-event-configuration-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8005 \
  --set-env-vars PORT=8005 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-event-config" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/4"

gcloud run deploy scheduling-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-scheduling-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8006 \
  --set-env-vars PORT=8006 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-scheduling" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/5"

gcloud run deploy scoring-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-scoring-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8007 \
  --set-env-vars PORT=8007 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-scoring" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/6"

gcloud run deploy reporting-service \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-reporting-service:latest" \
  --region us-central1 \
  --ingress internal \
  --allow-unauthenticated \
  --port 8008 \
  --set-env-vars PORT=8008 \
  --set-env-vars JWT_SECRET="your-strong-secret" \
  --set-env-vars MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/annual-sports-reporting" \
  --set-env-vars REDIS_URL="redis://<redis-host>:6379/7"
```

If you are enforcing IAM auth, grant the gateway service account invoke access
to each service:

```bash
gcloud run services add-iam-policy-binding identity-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding enrollment-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding department-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding sports-participation-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding event-configuration-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding scheduling-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding scoring-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

gcloud run services add-iam-policy-binding reporting-service \
  --region us-central1 \
  --member "serviceAccount:annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker
```

## 6) Deploy API Gateway (Public)

Create an NGINX config that proxies to the internal service URLs (replace the URLs
with the Cloud Run service URLs from `gcloud run services describe`). If you
enforced IAM auth, use a gateway that can attach identity tokens to requests.

```nginx
events {}
http {
  server {
    listen 80;
    location /identities { proxy_pass https://identity-service-<hash>-uc.a.run.app; }
    location /enrollments { proxy_pass https://enrollment-service-<hash>-uc.a.run.app; }
    location /departments { proxy_pass https://department-service-<hash>-uc.a.run.app; }
    location /sports-participations { proxy_pass https://sports-participation-service-<hash>-uc.a.run.app; }
    location /event-configurations { proxy_pass https://event-configuration-service-<hash>-uc.a.run.app; }
    location /schedulings { proxy_pass https://scheduling-service-<hash>-uc.a.run.app; }
    location /scorings { proxy_pass https://scoring-service-<hash>-uc.a.run.app; }
    location /reportings { proxy_pass https://reporting-service-<hash>-uc.a.run.app; }
  }
}
```

Build and push a gateway image, then deploy it:

```bash
gcloud run deploy annual-sports-gateway \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-gateway:latest" \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account "annual-sports-gateway@${PROJECT_ID}.iam.gserviceaccount.com" \
  --port 80
```

## 7) Deploy Frontend (Public)

```bash
gcloud run deploy annual-sports-frontend \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/annual-sports-frontend:latest" \
  --region us-central1 \
  --allow-unauthenticated \
  --port 80
```

## 8) HTTPS and Custom Domain

Use Cloud Run domain mappings:
- `your-domain.com` → frontend
- `api.your-domain.com` → gateway

```bash
gcloud run domain-mappings create \
  --service annual-sports-frontend \
  --domain your-domain.com \
  --region us-central1

gcloud run domain-mappings create \
  --service annual-sports-gateway \
  --domain api.your-domain.com \
  --region us-central1
```

## 9) Verify

```bash
curl -I https://your-domain.com
curl -I https://api.your-domain.com/identities/docs
```

## Manual Setup (Console)

Use Cloud Console to:
- Create Artifact Registry
- Deploy Cloud Run services (internal + public)
- Configure custom domains

## Teardown

```bash
gcloud run services delete annual-sports-frontend --region us-central1
gcloud run services delete annual-sports-gateway --region us-central1
gcloud run services delete identity-service --region us-central1
gcloud run services delete enrollment-service --region us-central1
gcloud run services delete department-service --region us-central1
gcloud run services delete sports-participation-service --region us-central1
gcloud run services delete event-configuration-service --region us-central1
gcloud run services delete scheduling-service --region us-central1
gcloud run services delete scoring-service --region us-central1
gcloud run services delete reporting-service --region us-central1
gcloud artifacts repositories delete annual-sports --location us-central1
```

## Best Practices Notes
- Use Secret Manager for backend secrets.
- Keep microservices internal-only; expose only the gateway and frontend.
- Pin image tags for releases.

## Terraform Option

If you want Infrastructure as Code, use `infra/gcp/cloud-run/README.md`.

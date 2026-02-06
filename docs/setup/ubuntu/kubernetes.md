# Ubuntu - Kubernetes Deployment (Microservices)

This guide deploys the frontend and multiple FastAPI services on a Kubernetes cluster. It assumes you already have a working Kubernetes cluster and `kubectl` configured.

## Prerequisites
- A Kubernetes cluster (minikube, k3s, EKS, GKE, AKS, etc.)
- `kubectl` installed and connected to your cluster
- Container registry access (Docker Hub, GHCR, ECR, etc.)
- Docker login for your registry (required for pushing images)

If you are new to Kubernetes, follow `new-structure/docs/setup/ubuntu/kubernetes-prereqs.md` first.

## 1) Build and Push Images

From the repo root:

Replace `your-registry` with your Docker registry/namespace (for example, `docker.io/<username>`).

```bash
docker login

for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  docker build -t "your-registry/annual-sports-${service}:latest" "new-structure/$service"
  docker push "your-registry/annual-sports-${service}:latest"
done

docker build -t your-registry/annual-sports-frontend:latest \
  --build-arg VITE_API_URL=/ \
  new-structure/frontend
docker push your-registry/annual-sports-frontend:latest
```

`VITE_API_URL` is a build-time value for the frontend image, so changing it requires a rebuild and redeploy.

## 2) Create Namespace

```bash
kubectl create namespace annual-sports
```

List namespaces:

```bash
kubectl get namespaces
```

If your registry is private, create an image pull secret:

```bash
kubectl -n annual-sports create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=<your-username> \
  --docker-password=<your-password-or-token> \
  --docker-email=<your-email>
```

Attach it to the default service account:

```bash
kubectl -n annual-sports patch serviceaccount default \
  -p '{"imagePullSecrets":[{"name":"regcred"}]}'
```

## 3) Create Secrets and Config

Create a single ConfigMap for all non-secret values (service URLs, shared defaults, and per-service non-secret settings). Keep only sensitive values in Secrets. All Kubernetes manifests live in `new-structure/docs/setup/ubuntu/k8s`.

In Kubernetes, services read configuration from ConfigMaps/Secrets; local `.env` files are not used.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/annual-sports-config.yaml
```

View ConfigMap values:

```bash
kubectl -n annual-sports get configmap annual-sports-config -o yaml
kubectl -n annual-sports get configmap annual-sports-config -o jsonpath='{.data}'
```

`VITE_API_URL` is still a build-time value for the frontend image, so changing it requires a rebuild and redeploy.

Create a shared Secret for common sensitive values (MongoDB URI, shared JWT secret, etc.), then create per-service Secrets for service-specific credentials.

```bash
kubectl -n annual-sports create secret generic annual-sports-secrets \
  --from-literal=MONGODB_URI="mongodb://mongodb-0.mongodb:27017" \
  --from-literal=JWT_SECRET="your-strong-secret"
```

Example for Identity (service-specific email/password secrets only):

```bash
kubectl -n annual-sports create secret generic identity-secrets \
  --from-literal=GMAIL_APP_PASSWORD="your-16-char-app-password" \
  --from-literal=SENDGRID_API_KEY="your-sendgrid-api-key" \
  --from-literal=RESEND_API_KEY="your-resend-api-key" \
  --from-literal=SMTP_PASSWORD="your-smtp-password"
```

View Secrets:

```bash
kubectl -n annual-sports get secrets
kubectl -n annual-sports get secret annual-sports-secrets -o yaml
kubectl -n annual-sports get secret annual-sports-secrets -o jsonpath='{.data.<key>}' | base64 --decode
```

## 4) Deploy Redis

Deploy Redis (matches `redis://redis:6379` in the ConfigMap):

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/redis.yaml
```

Verify Redis:

```bash
kubectl -n annual-sports get pods
kubectl -n annual-sports get svc redis
```

## 5) Deploy MongoDB (Optional)

- For production, use managed MongoDB.
- For local clusters, you can deploy MongoDB (use `mongodb.yaml`).

If you are using an external MongoDB, update the service `.env` values accordingly.

```bash
kubectl apply -f mongodb.yaml
```

## 6) Deploy Services

Create one Deployment and Service per microservice using the manifests in `new-structure/docs/setup/ubuntu/k8s`:

Before applying the service manifests, update the `image` values in each YAML file to use your Docker registry (replace `your-registry` with your registry/namespace).

```bash
sed -i "s|your-registry|<<registry>>|g" new-structure/docs/setup/ubuntu/k8s/*.yaml

kubectl apply -f new-structure/docs/setup/ubuntu/k8s/identity-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/enrollment-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/department-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/sports-participation-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/event-configuration-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/scheduling-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/scoring-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/reporting-service.yaml
```

Verify services:

```bash
kubectl -n annual-sports get pods
kubectl -n annual-sports get svc
```

Service ports:
- Identity: `8001`
- Enrollment: `8002`
- Department: `8003`
- Sports Participation: `8004`
- Event Configuration: `8005`
- Scheduling: `8006`
- Scoring: `8007`
- Reporting: `8008`

## 7) Deploy Frontend

Create a Deployment/Service for the frontend image (port 80). You can access it via
either the NGINX gateway, Ingress, or direct port-forwarding (see the Access section).

Before applying the frontend manifest, update the `image` value to use your Docker registry (replace `your-registry` with your registry/namespace).

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/frontend.yaml
```

Verify frontend:

```bash
kubectl -n annual-sports get pods
kubectl -n annual-sports get svc
kubectl -n annual-sports rollout status deploy/annual-sports-frontend
```

## 8) NGINX Gateway (Recommended with Port-Forward)

Use the bundled NGINX config to route API paths to backend services and `/` to the frontend.
This fixes `text/html` responses when the frontend tries to call backend paths on the same host.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/nginx-configmap.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/nginx-gateway.yaml
```

Verify NGINX:

```bash
kubectl -n annual-sports get pods
kubectl -n annual-sports get svc annual-sports-nginx
```

Port-forward the NGINX service and access the app:

```bash
kubectl -n annual-sports port-forward svc/annual-sports-nginx 8080:80 --address 0.0.0.0
```

Then open:

```
http://<PUBLIC_IP>:8080/
```

## 9) Ingress (Optional)

If you are using NGINX Ingress, install/enable it first. For minikube:

```bash
minikube addons enable ingress
```

Create the ingress using `ingress.yaml`. If you set `host`, ensure you access the
app with that host (DNS or `/etc/hosts`). If you omit `host`, the ingress matches
any host (useful for direct public IP access). Keep `VITE_API_URL=/` so the
frontend calls the backend via the same host.

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/ingress.yaml
```

Verify ingress:

```bash
kubectl -n annual-sports get ingress
```

To access the app via the public IP, use the ingress controller NodePort:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
```

Example output:

```
NAME                       TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
ingress-nginx-controller   NodePort   10.96.183.122   <none>        80:31234/TCP,443:31678/TCP   2m
```

Then open:

```
http://<PUBLIC_IP>:<INGRESS_NODEPORT>/
```

Example:

```
http://54.89.197.89:31234/
```

## 10) Apply Updated YAML

If a service manifest or the frontend manifest changes, re-apply and verify rollout:

```bash
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/identity-service.yaml
kubectl apply -f new-structure/docs/setup/ubuntu/k8s/frontend.yaml

kubectl -n annual-sports rollout status deploy/identity-service
kubectl -n annual-sports rollout status deploy/annual-sports-frontend
```

Check rollout history:

```bash
kubectl -n annual-sports rollout history deploy/identity-service
kubectl -n annual-sports rollout history deploy/annual-sports-frontend
```

Rollback (if needed):

```bash
kubectl -n annual-sports rollout undo deploy/identity-service
kubectl -n annual-sports rollout undo deploy/annual-sports-frontend
```

If the image tag stays the same (e.g., `latest`), restart to pull the new image:

```bash
kubectl -n annual-sports rollout restart deploy/identity-service
kubectl -n annual-sports rollout restart deploy/annual-sports-frontend
```

## 11) Access the Frontend

Choose one of the access methods below.

NGINX gateway (recommended when using port-forwarding):

```bash
kubectl -n annual-sports port-forward svc/annual-sports-nginx 8080:80 --address 0.0.0.0
```

Then visit:

```
http://<PUBLIC_IP>:8080/
```

Ingress (recommended for production-style access):

- If you have a LoadBalancer or NodePort for the ingress controller, use its address.
- For minikube with ingress NodePort:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
```

Then visit:

```
http://<PUBLIC_IP>:<INGRESS_NODEPORT>/
```

Direct frontend port-forward (UI-only; API calls may return `text/html`):

```bash
kubectl -n annual-sports port-forward svc/annual-sports-frontend 5173:80 --address 0.0.0.0
```

Then visit:

```
http://<PUBLIC_IP>:5173
```

If you are using minikube:

```bash
minikube service -n annual-sports annual-sports-frontend
```

If you get `xdg-open` / browser errors on a server VM, use the URL directly:

```bash
minikube service -n annual-sports annual-sports-frontend --url
```

For a systemd-based port-forward that survives SSH disconnects and VM reboots, see:
`new-structure/docs/setup/ubuntu/kubectl-port-forward-systemd.md`.

## 12) Troubleshooting

### ImagePullBackOff

```bash
kubectl -n annual-sports get pods
kubectl -n annual-sports describe pod <pod-name>
```

Common fixes:
- Make sure the image exists in your registry
- Run `docker login` and re-push
- If private, create `regcred` and attach it to the service account

### CrashLoopBackOff (frontend)

Check logs:

```bash
kubectl -n annual-sports logs <frontend-pod>
```

### Reset Minikube and Namespace

If you want to start from scratch:

```bash
kubectl delete namespace annual-sports
minikube delete
minikube start
```

### Stop and Restart Services (Minikube + systemd)

Stop everything (port-forward + cluster):

```bash
sudo systemctl stop annual-sports-nginx-forward
sudo systemctl disable annual-sports-nginx-forward
minikube stop
```

If you also enabled minikube as a systemd service:

```bash
sudo systemctl stop minikube
sudo systemctl disable minikube
```

Restart after a stop (manifests already applied):

```bash
sudo systemctl enable --now minikube
sudo systemctl enable --now annual-sports-nginx-forward
```

If you deleted the namespace or minikube, re-apply the manifests before restarting.

## Notes
- The frontend expects base paths like `/identities` and `/enrollments` to reach each service.
- For production, use TLS via Ingress and move secrets to a secret manager.

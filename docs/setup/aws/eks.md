# AWS EKS Deployment (Frontend + Microservices)

This guide deploys the app to AWS EKS with best-practice components:
- ECR for images
- EKS for workloads
- AWS Load Balancer Controller (ALB) for ingress

It assumes you already have a domain and can create DNS records.

## Prerequisites
- AWS account with permissions for EKS, ECR, IAM, and ACM
- `aws`, `kubectl`, `eksctl`, and `helm` installed
- A domain you control in Route 53 or another DNS provider

## 1) Configure AWS CLI

```bash
aws configure
```

## 2) Terraform (Recommended)

Terraform for EKS lives in:

`infra/aws/eks`

Quick start:

```bash
cd infra/aws/eks
terraform init -backend-config=hcl/backend-dev.hcl
cp tfvars/dev.tfvars.example dev.tfvars
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Then continue with image build/push and verification below.

## 3) Create ECR Repositories

```bash
aws ecr create-repository --repository-name annual-sports-identity-service
aws ecr create-repository --repository-name annual-sports-enrollment-service
aws ecr create-repository --repository-name annual-sports-department-service
aws ecr create-repository --repository-name annual-sports-sports-participation-service
aws ecr create-repository --repository-name annual-sports-event-configuration-service
aws ecr create-repository --repository-name annual-sports-scheduling-service
aws ecr create-repository --repository-name annual-sports-scoring-service
aws ecr create-repository --repository-name annual-sports-reporting-service
aws ecr create-repository --repository-name annual-sports-frontend
```

You will set `AWS_ACCOUNT_ID` and `AWS_REGION` in step 4.

## 4) Build and Push Images

Set variables:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
IMAGE_TAG=<your-image-tag>
CLUSTER_NAME=annual-sports
NAMESPACE=annual-sports
CERT_ARN=arn:aws:acm:us-east-1:123456789012:certificate/replace-with-your-cert-id
```

Login to ECR:

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Build and push:

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
  docker build -t "annual-sports-${service}:${IMAGE_TAG}" "$service"
  docker tag "annual-sports-${service}:${IMAGE_TAG}" \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/annual-sports-${service}:${IMAGE_TAG}"
  docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/annual-sports-${service}:${IMAGE_TAG}"
done

docker build -t annual-sports-frontend:${IMAGE_TAG} \
  --build-arg VITE_API_URL=/ \
  frontend
docker tag annual-sports-frontend:${IMAGE_TAG} \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/annual-sports-frontend:${IMAGE_TAG}"

docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/annual-sports-frontend:${IMAGE_TAG}"
```

`VITE_API_URL` is a build-time value; changing it requires a rebuild.

## 5) Create an EKS Cluster

Create a cluster with managed nodes:

```bash
eksctl create cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --nodegroup-name standard \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 4 \
  --managed
```

Verify access:

```bash
kubectl get nodes
```

## 6) Install AWS Load Balancer Controller

Associate IAM OIDC provider:

```bash
eksctl utils associate-iam-oidc-provider \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER_NAME" \
  --approve
```

Create the IAM policy for the controller:

```bash
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
POLICY_ARN=$(aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json \
  --query 'Policy.Arn' --output text)
```

Install the controller (recommended via Helm):

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

VPC_ID=$(aws eks describe-cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text)

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn "$POLICY_ARN" \
  --approve

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName="$CLUSTER_NAME" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region="$AWS_REGION" \
  --set vpcId="$VPC_ID"
```

## 7) Create Namespace, Config, and Secrets

```bash
kubectl create namespace "$NAMESPACE"
```

Create ConfigMaps for non-secret values and Secrets for sensitive values. Non-secrets should match `x-common-env` in `docker-compose.yml`. Secrets (MongoDB URI, JWT secret, email credentials) should come from AWS Secrets Manager or Kubernetes Secrets.

```bash
kubectl apply -f docs/setup/ubuntu/k8s/annual-sports-config.yaml
kubectl -n "$NAMESPACE" create secret generic annual-sports-secrets \
  --from-literal=MONGODB_URI="mongodb://mongodb-0.mongodb:27017" \
  --from-literal=JWT_SECRET="your-strong-secret"

kubectl -n "$NAMESPACE" create secret generic identity-secrets \
  --from-literal=GMAIL_APP_PASSWORD="your-16-char-app-password" \
  --from-literal=SENDGRID_API_KEY="your-sendgrid-api-key" \
  --from-literal=RESEND_API_KEY="your-resend-api-key" \
  --from-literal=SMTP_PASSWORD="your-smtp-password"
```

## 8) Deploy Redis and MongoDB

Redis is required for caching. Use **ElastiCache for Redis** in production and set `REDIS_URL` for each service.
If you want in-cluster Redis for testing, apply `docs/setup/ubuntu/k8s/redis.yaml`.

Deploy Redis (required for caching):

```bash
kubectl apply -f docs/setup/ubuntu/k8s/redis.yaml
```

MongoDB is optional if you use a managed provider (MongoDB Atlas). For in-cluster MongoDB:

```bash
kubectl apply -f docs/setup/ubuntu/k8s/mongodb.yaml
kubectl -n "$NAMESPACE" rollout status statefulset/mongodb
```

## 9) Deploy Services and Frontend

Create one Deployment/Service per microservice using the manifests in `docs/setup/ubuntu/k8s`,
then apply the frontend manifest. EKS uses ALB path routing; do not use the NGINX gateway.

```bash
kubectl apply -f docs/setup/ubuntu/k8s/identity-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/enrollment-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/department-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/sports-participation-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/event-configuration-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/scheduling-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/scoring-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/reporting-service.yaml
kubectl apply -f docs/setup/ubuntu/k8s/frontend.yaml

kubectl -n "$NAMESPACE" rollout status deploy/identity-service
kubectl -n "$NAMESPACE" rollout status deploy/annual-sports-frontend
```

## 10) Create an Ingress (ALB)

Create an `ingress.yaml` using ALB. Use `CERT_ARN` from step 4 to replace
arm-certificate-arn and replace host, then apply it:

```bash
cat <<'EOF' > ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${NAMESPACE}-ingress
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: <acm-certificate-arn>
    alb.ingress.kubernetes.io/ssl-redirect: "443"
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

Get the ALB hostname:

```bash
kubectl -n "$NAMESPACE" get ingress
```

Create DNS records pointing your domains to the ALB hostname.

## 11) Update Frontend API URL

If you are using a separate API domain:
- Set `VITE_API_URL=https://api.your-domain.com` and rebuild the frontend image.

If you are using a single domain:
- Set `VITE_API_URL=https://your-domain.com` and rebuild.

Push the new image and update the deployment.

## 12) Verify

```bash
curl -I https://your-domain.com
curl -I https://your-domain.com/identities/docs
```

## Manual Setup (Console)

If you prefer the AWS Console:
- ECR: create repositories for each service plus `annual-sports-frontend`.
- EKS: create a cluster with managed node group (2+ nodes), then update kubeconfig.
- IAM OIDC: enable the OIDC provider for the cluster.
- Load Balancer Controller: create the IAM role + service account (IRSA), then install the Helm chart.
- Route 53: create A/ALIAS records pointing to the ALB hostname.

You will still apply Kubernetes manifests with `kubectl`.

## Teardown

Delete Route 53 records first (optional, only if you created them):

```bash
# Reuse CLUSTER_NAME, NAMESPACE, AWS_REGION, and CERT_ARN from earlier steps.

ROUTE53_ZONE_ID=<your-hosted-zone-id>
ALB_HOSTNAME=$(kubectl -n "$NAMESPACE" get ingress "${NAMESPACE}-ingress" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
ALB_ZONE_ID=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='${ALB_HOSTNAME}'].CanonicalHostedZoneId | [0]" --output text)

aws route53 change-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" --change-batch '{
  "Changes": [
    {
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "your-domain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "'"$ALB_ZONE_ID"'",
          "DNSName": "'"$ALB_HOSTNAME"'",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}'
```

Remove Kubernetes resources:

```bash
kubectl delete ingress -n "$NAMESPACE" "${NAMESPACE}-ingress"
kubectl delete -f docs/setup/ubuntu/k8s/frontend.yaml
kubectl delete -f docs/setup/ubuntu/k8s/identity-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/enrollment-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/department-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/sports-participation-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/event-configuration-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/scheduling-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/scoring-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/reporting-service.yaml
kubectl delete -f docs/setup/ubuntu/k8s/mongodb.yaml
kubectl delete -f docs/setup/ubuntu/k8s/redis.yaml
kubectl delete namespace "$NAMESPACE"
```

Remove the load balancer controller:

```bash
helm uninstall aws-load-balancer-controller -n kube-system
eksctl delete iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace kube-system \
  --name aws-load-balancer-controller

# Reuse POLICY_ARN from step 6.
aws iam delete-policy --policy-arn "$POLICY_ARN"
```

Delete the EKS cluster:

```bash
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

Delete ECR repositories:

```bash
aws ecr delete-repository --repository-name annual-sports-identity-service --force
aws ecr delete-repository --repository-name annual-sports-enrollment-service --force
aws ecr delete-repository --repository-name annual-sports-department-service --force
aws ecr delete-repository --repository-name annual-sports-sports-participation-service --force
aws ecr delete-repository --repository-name annual-sports-event-configuration-service --force
aws ecr delete-repository --repository-name annual-sports-scheduling-service --force
aws ecr delete-repository --repository-name annual-sports-scoring-service --force
aws ecr delete-repository --repository-name annual-sports-reporting-service --force
aws ecr delete-repository --repository-name annual-sports-frontend --force
```

## Best Practices Notes
- Use MongoDB Atlas instead of in-cluster MongoDB for production.
- Store secrets in AWS Secrets Manager and sync them to Kubernetes (external-secrets).
- Use separate namespaces per environment (dev/staging/prod).
- Pin image tags (avoid `latest`) and enable image scanning in ECR.
- Enable cluster autoscaling and set resource limits/requests.

## Terraform Option

If you want Infrastructure as Code, use `infra/aws/eks/README.md`.

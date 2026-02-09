#!/usr/bin/env markdown
# AWS EKS Deployment (Backend Only)

This guide deploys the backend to AWS EKS using CLI tools only. Frontend hosting
is separate: `docs/setup/aws/frontend.md`.

## Prerequisites
- AWS account with permissions for EKS, ECR, IAM, ACM, ALB, Secrets Manager
- AWS CLI configured (`aws configure`)
- `eksctl`, `kubectl`, and `helm` installed
- Docker installed
- `jq` and `envsubst` available
- A domain you control and an ACM certificate in the same region as the ALB

## 1) Set Variables

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
ENV=dev
NAME_PREFIX=as-$ENV
CLUSTER_NAME=annual-sports-$ENV
API_DOMAIN=api.your-domain.com
ACM_CERT_ARN=arn:aws:acm:${AWS_REGION}:123456789012:certificate/replace-with-your-cert-id
VPC_CIDR=10.0.0.0/16

APP_NAMESPACE=annual-sports
APP_ENV=development
LOG_LEVEL=INFO
JWT_EXPIRES_IN=24h
ADMIN_REG_NUMBER=admin

EMAIL_PROVIDER=gmail
GMAIL_USER=your-email@gmail.com
SENDGRID_USER=
SMTP_HOST=
SMTP_USER=
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_FROM=no-reply@your-domain.com
EMAIL_FROM_NAME="Sports Event Management"
APP_NAME="Sports Event Management System"

CPU_REQUEST=250m
CPU_LIMIT=500m
MEMORY_REQUEST=512Mi
MEMORY_LIMIT=1024Mi

HPA_MIN=1
HPA_MAX=4
HPA_CPU_TARGET=60
HPA_MEMORY_TARGET=70
ALB_REQUEST_TARGET=200
KEDA_POLLING_INTERVAL=30
KEDA_COOLDOWN_PERIOD=300
```

## 2) Create EKS Cluster (Private Endpoint, Per‑AZ NAT)

Pick two AZs:

```bash
AZ_A=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[0].ZoneName' --output text)
AZ_B=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[1].ZoneName' --output text)
```

Create an `eksctl` config:

```bash
cat > eksctl-cluster.yaml <<EOF
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ${CLUSTER_NAME}
  region: ${AWS_REGION}
  version: "1.29"

vpc:
  cidr: ${VPC_CIDR}
  nat:
    gateway: HighlyAvailable
  subnets:
    public:
      ${AZ_A}:
        cidr: 10.0.1.0/24
      ${AZ_B}:
        cidr: 10.0.2.0/24
    private:
      ${AZ_A}:
        cidr: 10.0.11.0/24
      ${AZ_B}:
        cidr: 10.0.12.0/24

privateCluster:
  enabled: true
  skipEndpointCreation: false

iam:
  withOIDC: true

managedNodeGroups:
  - name: ${NAME_PREFIX}-ng
    instanceType: t3.medium
    desiredCapacity: 2
    minSize: 2
    maxSize: 4
    privateNetworking: true
EOF
```

Create the cluster:

```bash
eksctl create cluster -f eksctl-cluster.yaml
```

Update kubeconfig (run inside the VPC or via VPN/SSM/bastion because the API is private):

```bash
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

## 3) Create Secrets in AWS Secrets Manager

Create these secrets in the same region as the cluster:
- `${NAME_PREFIX}-jwt`
- `${NAME_PREFIX}-mongo-uri` (Mongo URI without DB name)
- Identity-only email secrets:
  - `${NAME_PREFIX}-gmail-app-password`
  - `${NAME_PREFIX}-sendgrid-api-key`
  - `${NAME_PREFIX}-resend-api-key`
  - `${NAME_PREFIX}-smtp-password`

```bash
aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-jwt \
  --secret-string "replace-with-strong-secret"

aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-mongo-uri \
  --secret-string "mongodb+srv://user:pass@cluster"

aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-gmail-app-password \
  --secret-string "your-app-password"

aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-sendgrid-api-key \
  --secret-string "your-sendgrid-api-key"

aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-resend-api-key \
  --secret-string "your-resend-api-key"

aws secretsmanager create-secret \
  --name ${NAME_PREFIX}-smtp-password \
  --secret-string "your-smtp-password"
```

## 4) Create ECR Repositories and Push Images

Create repositories:

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
  aws ecr create-repository --repository-name ${NAME_PREFIX}-${service} || true
done
```

Login to ECR:

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Build and push:

```bash
IMAGE_TAG=<your-image-tag>
REPO_ROOT=$(git rev-parse --show-toplevel)

for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  docker build -t "${NAME_PREFIX}-${service}:${IMAGE_TAG}" "$REPO_ROOT/$service"
  docker tag "${NAME_PREFIX}-${service}:${IMAGE_TAG}" \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
  docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
done
```

## 5) Create the App Namespace

```bash
kubectl create namespace "$APP_NAMESPACE" || true
```

## 6) Install AWS Load Balancer Controller

Download the IAM policy and create it:

```bash
curl -sS https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.1/docs/install/iam_policy.json \
  -o alb-controller-policy.json

ALB_POLICY_ARN=$(aws iam create-policy \
  --policy-name "${NAME_PREFIX}-alb-controller" \
  --policy-document file://alb-controller-policy.json \
  --query 'Policy.Arn' --output text 2>/dev/null || \
  aws iam list-policies --scope Local --query "Policies[?PolicyName=='${NAME_PREFIX}-alb-controller'].Arn | [0]" --output text)
```

Create the service account and install via Helm:

```bash
eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn "$ALB_POLICY_ARN" \
  --approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName="$CLUSTER_NAME" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

## 7) Install Metrics Server and CloudWatch Observability Add‑ons

```bash
aws eks create-addon --cluster-name "$CLUSTER_NAME" --addon-name metrics-server \
  --region "$AWS_REGION" || true

aws eks create-addon --cluster-name "$CLUSTER_NAME" --addon-name amazon-cloudwatch-observability \
  --region "$AWS_REGION" || true
```

## 8) Provision Redis (ElastiCache)

```bash
VPC_ID=$(aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.resourcesVpcConfig.vpcId' --output text)
CLUSTER_SG_ID=$(aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)

REDIS_SG_ID=$(aws ec2 create-security-group \
  --group-name "${NAME_PREFIX}-redis" \
  --description "Redis access from EKS" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$REDIS_SG_ID" \
  --protocol tcp --port 6379 \
  --source-group "$CLUSTER_SG_ID"

PRIV_SUBNETS=$(aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.resourcesVpcConfig.subnetIds' --output text)

aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name "${NAME_PREFIX}-redis" \
  --cache-subnet-group-description "Annual sports Redis subnets" \
  --subnet-ids $PRIV_SUBNETS

aws elasticache create-cache-cluster \
  --cache-cluster-id "${NAME_PREFIX}-redis" \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name "${NAME_PREFIX}-redis" \
  --security-group-ids "$REDIS_SG_ID"

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "${NAME_PREFIX}-redis" \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)
```

## 9) Install External Secrets Operator (ESO)

Create IAM policy and service account:

```bash
cat > eso-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    }
  ]
}
EOF

ESO_POLICY_ARN=$(aws iam create-policy \
  --policy-name "${NAME_PREFIX}-external-secrets" \
  --policy-document file://eso-policy.json \
  --query 'Policy.Arn' --output text 2>/dev/null || \
  aws iam list-policies --scope Local --query "Policies[?PolicyName=='${NAME_PREFIX}-external-secrets'].Arn | [0]" --output text)

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace external-secrets \
  --name external-secrets \
  --attach-policy-arn "$ESO_POLICY_ARN" \
  --approve
```

Install ESO:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --set serviceAccount.create=false \
  --set serviceAccount.name=external-secrets
```

Create ClusterSecretStore:

```bash
cat > cluster-secret-store.yaml <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secretsmanager
spec:
  provider:
    aws:
      service: SecretsManager
      region: ${AWS_REGION}
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets
EOF

kubectl apply -f cluster-secret-store.yaml
```

Create ExternalSecrets:

```bash
mkdir -p k8s/templates k8s/rendered

cat > k8s/templates/external-secret.yaml <<'EOF'
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ${SERVICE_NAME}-secrets
  namespace: ${APP_NAMESPACE}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: ${SERVICE_NAME}-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: ${NAME_PREFIX}-jwt
    - secretKey: MONGODB_URI
      remoteRef:
        key: ${NAME_PREFIX}-mongo-uri
EOF

cat > k8s/templates/external-secret-identity.yaml <<'EOF'
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: identity-service-secrets
  namespace: ${APP_NAMESPACE}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: identity-service-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: ${NAME_PREFIX}-jwt
    - secretKey: MONGODB_URI
      remoteRef:
        key: ${NAME_PREFIX}-mongo-uri
    - secretKey: GMAIL_APP_PASSWORD
      remoteRef:
        key: ${NAME_PREFIX}-gmail-app-password
    - secretKey: SENDGRID_API_KEY
      remoteRef:
        key: ${NAME_PREFIX}-sendgrid-api-key
    - secretKey: RESEND_API_KEY
      remoteRef:
        key: ${NAME_PREFIX}-resend-api-key
    - secretKey: SMTP_PASSWORD
      remoteRef:
        key: ${NAME_PREFIX}-smtp-password
EOF

for service in \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  SERVICE_NAME=$service envsubst < k8s/templates/external-secret.yaml \
    > "k8s/rendered/${service}-external-secret.yaml"
done

envsubst < k8s/templates/external-secret-identity.yaml \
  > k8s/rendered/identity-service-external-secret.yaml

kubectl apply -f k8s/rendered
```

## 10) Create Service Accounts

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
  kubectl -n "$APP_NAMESPACE" create serviceaccount "$service" || true
done
```

## 11) Create ConfigMaps (Non‑secret Env)

Create templates:

```bash
cat > k8s/templates/service-env.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${SERVICE_NAME}-env
  namespace: ${APP_NAMESPACE}
data:
  APP_ENV: "${APP_ENV}"
  LOG_LEVEL: "${LOG_LEVEL}"
  JWT_EXPIRES_IN: "${JWT_EXPIRES_IN}"
  ADMIN_REG_NUMBER: "${ADMIN_REG_NUMBER}"
  IDENTITY_URL: "http://identity-service:8001"
  ENROLLMENT_URL: "http://enrollment-service:8002"
  DEPARTMENT_URL: "http://department-service:8003"
  SPORTS_PARTICIPATION_URL: "http://sports-participation-service:8004"
  EVENT_CONFIGURATION_URL: "http://event-configuration-service:8005"
  SCHEDULING_URL: "http://scheduling-service:8006"
  SCORING_URL: "http://scoring-service:8007"
  REPORTING_URL: "http://reporting-service:8008"
  DATABASE_NAME: "${DATABASE_NAME}"
  REDIS_URL: "redis://${REDIS_ENDPOINT}:6379/${REDIS_DB}"
EOF

cat > k8s/templates/identity-env.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: identity-service-env
  namespace: ${APP_NAMESPACE}
data:
  APP_ENV: "${APP_ENV}"
  LOG_LEVEL: "${LOG_LEVEL}"
  JWT_EXPIRES_IN: "${JWT_EXPIRES_IN}"
  ADMIN_REG_NUMBER: "${ADMIN_REG_NUMBER}"
  IDENTITY_URL: "http://identity-service:8001"
  ENROLLMENT_URL: "http://enrollment-service:8002"
  DEPARTMENT_URL: "http://department-service:8003"
  SPORTS_PARTICIPATION_URL: "http://sports-participation-service:8004"
  EVENT_CONFIGURATION_URL: "http://event-configuration-service:8005"
  SCHEDULING_URL: "http://scheduling-service:8006"
  SCORING_URL: "http://scoring-service:8007"
  REPORTING_URL: "http://reporting-service:8008"
  DATABASE_NAME: "${NAME_PREFIX}-identity"
  REDIS_URL: "redis://${REDIS_ENDPOINT}:6379/0"
  EMAIL_PROVIDER: "${EMAIL_PROVIDER}"
  GMAIL_USER: "${GMAIL_USER}"
  SENDGRID_USER: "${SENDGRID_USER}"
  SMTP_HOST: "${SMTP_HOST}"
  SMTP_USER: "${SMTP_USER}"
  SMTP_PORT: "${SMTP_PORT}"
  SMTP_SECURE: "${SMTP_SECURE}"
  EMAIL_FROM: "${EMAIL_FROM}"
  EMAIL_FROM_NAME: "${EMAIL_FROM_NAME}"
  APP_NAME: "${APP_NAME}"
EOF
```

Render and apply ConfigMaps:

```bash
for service in \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  case $service in
    enrollment-service) DATABASE_NAME=${NAME_PREFIX}-enrollment; REDIS_DB=1 ;;
    department-service) DATABASE_NAME=${NAME_PREFIX}-department; REDIS_DB=2 ;;
    sports-participation-service) DATABASE_NAME=${NAME_PREFIX}-sports-part; REDIS_DB=3 ;;
    event-configuration-service) DATABASE_NAME=${NAME_PREFIX}-event-config; REDIS_DB=4 ;;
    scheduling-service) DATABASE_NAME=${NAME_PREFIX}-scheduling; REDIS_DB=5 ;;
    scoring-service) DATABASE_NAME=${NAME_PREFIX}-scoring; REDIS_DB=6 ;;
    reporting-service) DATABASE_NAME=${NAME_PREFIX}-reporting; REDIS_DB=7 ;;
  esac

  SERVICE_NAME=$service envsubst < k8s/templates/service-env.yaml \
    > "k8s/rendered/${service}-env.yaml"
done

envsubst < k8s/templates/identity-env.yaml > k8s/rendered/identity-service-env.yaml

kubectl apply -f k8s/rendered
```

## 12) Create Deployments and Services

Create templates:

```bash
cat > k8s/templates/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}
  namespace: ${APP_NAMESPACE}
  labels:
    app: ${SERVICE_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${SERVICE_NAME}
  template:
    metadata:
      labels:
        app: ${SERVICE_NAME}
    spec:
      serviceAccountName: ${SERVICE_NAME}
      containers:
        - name: ${SERVICE_NAME}
          image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${NAME_PREFIX}-${SERVICE_NAME}:${IMAGE_TAG}
          ports:
            - containerPort: ${SERVICE_PORT}
          resources:
            requests:
              cpu: ${CPU_REQUEST}
              memory: ${MEMORY_REQUEST}
            limits:
              cpu: ${CPU_LIMIT}
              memory: ${MEMORY_LIMIT}
          readinessProbe:
            httpGet:
              path: /health
              port: ${SERVICE_PORT}
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: ${SERVICE_PORT}
            initialDelaySeconds: 30
            periodSeconds: 20
          envFrom:
            - secretRef:
                name: ${SERVICE_NAME}-secrets
            - configMapRef:
                name: ${SERVICE_NAME}-env
EOF

cat > k8s/templates/service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${APP_NAMESPACE}
spec:
  type: ClusterIP
  selector:
    app: ${SERVICE_NAME}
  ports:
    - port: ${SERVICE_PORT}
      targetPort: ${SERVICE_PORT}
      protocol: TCP
EOF
```

Render and apply:

```bash
declare -A SERVICE_PORTS=(
  [identity-service]=8001
  [enrollment-service]=8002
  [department-service]=8003
  [sports-participation-service]=8004
  [event-configuration-service]=8005
  [scheduling-service]=8006
  [scoring-service]=8007
  [reporting-service]=8008
)

for service in "${!SERVICE_PORTS[@]}"; do
  SERVICE_NAME=$service
  SERVICE_PORT=${SERVICE_PORTS[$service]}

  envsubst < k8s/templates/deployment.yaml \
    > "k8s/rendered/${service}-deployment.yaml"

  envsubst < k8s/templates/service.yaml \
    > "k8s/rendered/${service}-service.yaml"
done

kubectl apply -f k8s/rendered
```

## 13) Create Ingress (ALB)

```bash
cat > k8s/ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${NAME_PREFIX}-alb
  namespace: ${APP_NAMESPACE}
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/load-balancer-name: ${NAME_PREFIX}-alb
    alb.ingress.kubernetes.io/certificate-arn: ${ACM_CERT_ARN}
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /health
spec:
  rules:
    - host: ${API_DOMAIN}
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

kubectl apply -f k8s/ingress.yaml
```

## 14) Install KEDA and Apply ScaledObjects (Optional)

Create IAM policy and service account:

```bash
cat > keda-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    }
  ]
}
EOF

KEDA_POLICY_ARN=$(aws iam create-policy \
  --policy-name "${NAME_PREFIX}-keda" \
  --policy-document file://keda-policy.json \
  --query 'Policy.Arn' --output text 2>/dev/null || \
  aws iam list-policies --scope Local --query "Policies[?PolicyName=='${NAME_PREFIX}-keda'].Arn | [0]" --output text)

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" \
  --namespace keda \
  --name keda-operator \
  --attach-policy-arn "$KEDA_POLICY_ARN" \
  --approve
```

Install KEDA:

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

helm upgrade --install keda kedacore/keda \
  --namespace keda \
  --create-namespace \
  --set serviceAccount.create=false \
  --set serviceAccount.name=keda-operator
```

Get ALB target group ARN suffixes (after Ingress creates the ALB):

```bash
TG_ID_SUFFIX=$(aws elbv2 describe-target-groups \
  --names "${NAME_PREFIX}-id" \
  --query 'TargetGroups[0].TargetGroupArn' --output text | sed 's|.*/targetgroup/||')
```

Create a ScaledObject template:

```bash
cat > k8s/templates/scaledobject.yaml <<'EOF'
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ${SERVICE_NAME}
  namespace: ${APP_NAMESPACE}
spec:
  scaleTargetRef:
    name: ${SERVICE_NAME}
  minReplicaCount: ${HPA_MIN}
  maxReplicaCount: ${HPA_MAX}
  pollingInterval: ${KEDA_POLLING_INTERVAL}
  cooldownPeriod: ${KEDA_COOLDOWN_PERIOD}
  triggers:
    - type: cpu
      metricType: Utilization
      metadata:
        value: "${HPA_CPU_TARGET}"
    - type: memory
      metricType: Utilization
      metadata:
        value: "${HPA_MEMORY_TARGET}"
    - type: aws-cloudwatch
      metadata:
        namespace: "AWS/ApplicationELB"
        metricName: "RequestCountPerTarget"
        dimensionName: "TargetGroup"
        dimensionValue: "${TARGET_GROUP_ARN_SUFFIX}"
        awsRegion: "${AWS_REGION}"
        targetMetricValue: "${ALB_REQUEST_TARGET}"
        metricStat: "Average"
        metricStatPeriod: "60"
EOF
```

Render and apply (repeat per service with its target group suffix):

```bash
SERVICE_NAME=identity-service
TARGET_GROUP_ARN_SUFFIX=$TG_ID_SUFFIX
envsubst < k8s/templates/scaledobject.yaml > k8s/rendered/identity-scaledobject.yaml
kubectl apply -f k8s/rendered/identity-scaledobject.yaml
```

## 15) Verify

```bash
kubectl -n "$APP_NAMESPACE" get pods
kubectl -n "$APP_NAMESPACE" get ingress

curl -I https://$API_DOMAIN/identities/docs
```

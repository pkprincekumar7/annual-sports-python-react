# AWS ECS (Fargate) Deployment (Backend Only)

This guide deploys the backend to AWS ECS Fargate with best-practice components:
- ECR for images
- ECS Fargate for workloads
- ALB for HTTPS ingress

It assumes you already have a domain and can create DNS records.

## Prerequisites
- AWS account with permissions for ECS, ECR, IAM, ACM, and ALB
- AWS CLI installed (`aws configure`)
- A domain you control (Route 53 or external DNS)

## Manual Setup (Console or CLI)

### 1) Create Secrets in AWS Secrets Manager

The manual flow creates secrets now.

Create these secrets **in the same region** you will deploy ECS:
- `${NAME_PREFIX}-jwt` (JWT secret)
- `${NAME_PREFIX}-mongo-uri` (shared MongoDB URI; DB name comes from `DATABASE_NAME`)
- Identity-only email secrets:
  - `${NAME_PREFIX}-gmail-app-password`
  - `${NAME_PREFIX}-sendgrid-api-key`
  - `${NAME_PREFIX}-resend-api-key`
  - `${NAME_PREFIX}-smtp-password`

Set the name prefix and create secrets (replace values):

```bash
NAME_PREFIX=as-dev

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

### 2) Create ECR Repositories

```bash
NAME_PREFIX=as-dev

aws ecr create-repository --repository-name ${NAME_PREFIX}-identity-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-enrollment-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-department-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-sports-participation-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-event-configuration-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-scheduling-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-scoring-service
aws ecr create-repository --repository-name ${NAME_PREFIX}-reporting-service
```

### 3) Build and Push Images

Set variables:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
IMAGE_TAG=<your-image-tag>
CLUSTER_NAME=annual-sports-dev
NAME_PREFIX=as-dev
SERVICE_NAMESPACE=${NAME_PREFIX}.local
# ALB cert must be in the same region as ECS/ALB
CERT_ARN=arn:aws:acm:${AWS_REGION}:123456789012:certificate/replace-with-your-cert-id
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
  docker build -t "${NAME_PREFIX}-${service}:${IMAGE_TAG}" "$service"
  docker tag "${NAME_PREFIX}-${service}:${IMAGE_TAG}" \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
  docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${NAME_PREFIX}-${service}:${IMAGE_TAG}"
done
```

`VITE_API_URL` is a build-time value; changing it requires a rebuild.

Frontend hosting is separate (see `docs/setup/aws/frontend.md`).

### 4) Create a VPC

Use an existing VPC or create a new one with:
- 2+ public subnets (ALB)
- 2+ private subnets (Fargate tasks)
- NAT gateway for private subnets

CLI example:

```bash
# VPC
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query 'Vpc.VpcId' --output text)
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames
aws ec2 create-tags --resources "$VPC_ID" --tags Key=Name,Value="${NAME_PREFIX}-vpc"

# Internet gateway + public route table
IGW_ID=$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
PUBLIC_RT_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$PUBLIC_RT_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"

# Subnets (example CIDRs/AZs)
AZ_A=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[0].ZoneName' --output text)
AZ_B=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[1].ZoneName' --output text)
PUB_SUBNET_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.1.0/24 --availability-zone "$AZ_A" --query 'Subnet.SubnetId' --output text)
PUB_SUBNET_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.2.0/24 --availability-zone "$AZ_B" --query 'Subnet.SubnetId' --output text)
PRIV_SUBNET_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.11.0/24 --availability-zone "$AZ_A" --query 'Subnet.SubnetId' --output text)
PRIV_SUBNET_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.12.0/24 --availability-zone "$AZ_B" --query 'Subnet.SubnetId' --output text)
aws ec2 associate-route-table --subnet-id "$PUB_SUBNET_A" --route-table-id "$PUBLIC_RT_ID"
aws ec2 associate-route-table --subnet-id "$PUB_SUBNET_B" --route-table-id "$PUBLIC_RT_ID"

# NAT gateway for private subnets
EIP_ALLOC_ID=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
NAT_ID=$(aws ec2 create-nat-gateway --subnet-id "$PUB_SUBNET_A" --allocation-id "$EIP_ALLOC_ID" --query 'NatGateway.NatGatewayId' --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_ID"
PRIVATE_RT_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$PRIVATE_RT_ID" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_ID"
aws ec2 associate-route-table --subnet-id "$PRIV_SUBNET_A" --route-table-id "$PRIVATE_RT_ID"
aws ec2 associate-route-table --subnet-id "$PRIV_SUBNET_B" --route-table-id "$PRIVATE_RT_ID"
```

### 5) Create an ECS Cluster

```bash
aws ecs create-cluster --cluster-name "$CLUSTER_NAME"
```

### 6) Create a Cloud Map Private Namespace

Create a private DNS namespace (use the value from Step 3, example: `as-dev.local`):

```bash
# Reuse SERVICE_NAMESPACE from step 3.

NAMESPACE_OP_ID=$(aws servicediscovery create-private-dns-namespace \
  --name "$SERVICE_NAMESPACE" \
  --vpc "$VPC_ID" \
  --query 'OperationId' --output text)

while true; do
  STATUS=$(aws servicediscovery get-operation --operation-id "$NAMESPACE_OP_ID" --query 'Operation.Status' --output text)
  if [ "$STATUS" = "SUCCESS" ]; then
    break
  fi
  sleep 5
done

NAMESPACE_ID=$(aws servicediscovery get-operation --operation-id "$NAMESPACE_OP_ID" --query 'Operation.Targets.NAMESPACE' --output text)

IDENTITY_SD_ARN=$(aws servicediscovery create-service \
  --name identity-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
ENROLLMENT_SD_ARN=$(aws servicediscovery create-service \
  --name enrollment-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
DEPARTMENT_SD_ARN=$(aws servicediscovery create-service \
  --name department-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
SPORTS_PARTICIPATION_SD_ARN=$(aws servicediscovery create-service \
  --name sports-participation-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
EVENT_CONFIGURATION_SD_ARN=$(aws servicediscovery create-service \
  --name event-configuration-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
SCHEDULING_SD_ARN=$(aws servicediscovery create-service \
  --name scheduling-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
SCORING_SD_ARN=$(aws servicediscovery create-service \
  --name scoring-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
REPORTING_SD_ARN=$(aws servicediscovery create-service \
  --name reporting-service \
  --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
  --query 'Service.Arn' --output text)
```

### 7) Create IAM Roles

Create an execution role (pull images, write logs, read secrets) and per-service
task roles (app runtime permissions):

```bash
cat > ecs-task-trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name "${NAME_PREFIX}-task-execution" \
  --assume-role-policy-document file://ecs-task-trust-policy.json

aws iam attach-role-policy \
  --role-name "${NAME_PREFIX}-task-execution" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

cat > ecs-secrets-policy.json <<'EOF'
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

Note: For least-privilege access (as in Terraform), replace `"Resource": "*"` with
the specific secret ARNs (JWT, Mongo URI, and identity email secrets).

aws iam put-role-policy \
  --role-name "${NAME_PREFIX}-task-execution" \
  --policy-name ecs-secrets-policy \
  --policy-document file://ecs-secrets-policy.json

for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  aws iam create-role \
    --role-name "${NAME_PREFIX}-${service}-task-role" \
    --assume-role-policy-document file://ecs-task-trust-policy.json
done
```

### 8) Create CloudWatch Log Groups

Create log groups used by task definitions:

```bash
for name in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  aws logs create-log-group --log-group-name "/ecs/${NAME_PREFIX}/${name}" || true
  aws logs put-retention-policy --log-group-name "/ecs/${NAME_PREFIX}/${name}" --retention-in-days 14
done
```

### 9) Create Task Definitions

Create a task definition per microservice (Fargate):
- CPU/memory (e.g., 512/1024)
- Container images from ECR
- Port mappings:
  - services: `8001`–`8008`
- Environment variables per service:
  - Non-secret values (app settings + service URLs) should match `x-common-env` in `docker-compose.yml`.
- `DATABASE_NAME` differs per service (use `${NAME_PREFIX}-identity`, `${NAME_PREFIX}-enrollment`, etc.).
  - Secrets should come from AWS Secrets Manager:
    - `JWT_SECRET` from `jwt_secret_arn`
    - `MONGODB_URI` from `mongo_uri_secret_arn` (shared)
    - identity email secrets from their respective ARNs

Health check command should call the `/health` endpoint (for example,
`curl -fsS http://localhost:<port>/health > /dev/null`).

For service URL variables (`IDENTITY_URL`, `ENROLLMENT_URL`, etc.), use Cloud Map DNS:
- `http://identity-service.${SERVICE_NAMESPACE}:8001`
- `http://enrollment-service.${SERVICE_NAMESPACE}:8002`

Service-to-service URLs should use **Cloud Map service discovery** (private DNS). Example format:

- `http://identity-service.${SERVICE_NAMESPACE}:8001`
- `http://enrollment-service.${SERVICE_NAMESPACE}:8002`

ECS uses ALB path routing; no NGINX gateway is required.

Task definition templates live in:

`docs/setup/aws/task-defs`

Register them after Redis is provisioned (so `REDIS_ENDPOINT` is available).

### 10) Provision Redis

Provision a managed Redis (ElastiCache) and set `REDIS_URL` for each service
(e.g., `redis://<endpoint>:6379/0`).

CLI example:

```bash
ECS_SG_ID=$(aws ec2 create-security-group \
  --group-name "${NAME_PREFIX}-ecs-tasks" \
  --description "ECS tasks security group" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$ECS_SG_ID" \
  --protocol tcp --port 8001-8008 \
  --source-group "$ECS_SG_ID"

REDIS_SG_ID=$(aws ec2 create-security-group \
  --group-name "${NAME_PREFIX}-redis" \
  --description "Redis access from ECS tasks" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$REDIS_SG_ID" \
  --protocol tcp --port 6379 \
  --source-group "$ECS_SG_ID"

aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name "${NAME_PREFIX}-redis" \
  --cache-subnet-group-description "Annual sports Redis subnets" \
  --subnet-ids "$PRIV_SUBNET_A" "$PRIV_SUBNET_B"

aws elasticache create-cache-cluster \
  --cache-cluster-id "${NAME_PREFIX}-redis" \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name "${NAME_PREFIX}-redis" \
  --security-group-ids "$REDIS_SG_ID"
```

### 11) Render and Register Task Definitions

Set shared variables and render the templates. The `rendered/` folder is the
output of `envsubst`, where `${VAR}` placeholders are replaced with actual values.
Use values created in earlier steps and query ARNs as shown below:

```bash
cd docs/setup/aws

# Reuse AWS_ACCOUNT_ID, AWS_REGION, IMAGE_TAG, CLUSTER_NAME, NAME_PREFIX,
# and SERVICE_NAMESPACE from Step 3.

# Secrets ARNs (created in step 1)
JWT_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-jwt --query 'ARN' --output text)
MONGO_URI_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-mongo-uri --query 'ARN' --output text)
GMAIL_APP_PASSWORD_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-gmail-app-password --query 'ARN' --output text)
SENDGRID_API_KEY_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-sendgrid-api-key --query 'ARN' --output text)
RESEND_API_KEY_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-resend-api-key --query 'ARN' --output text)
SMTP_PASSWORD_ARN=$(aws secretsmanager describe-secret --secret-id ${NAME_PREFIX}-smtp-password --query 'ARN' --output text)

# Redis endpoint (created in step 10)
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "${NAME_PREFIX}-redis" \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)

# IAM roles (create or reuse existing)
EXECUTION_ROLE_ARN=$(aws iam get-role --role-name "${NAME_PREFIX}-task-execution" --query 'Role.Arn' --output text)

mkdir -p task-defs/rendered
for file in task-defs/*.json; do
  service=$(basename "$file" .json)
  TASK_ROLE_ARN=$(aws iam get-role --role-name "${NAME_PREFIX}-${service}-task-role" --query 'Role.Arn' --output text)
  envsubst < "$file" > "task-defs/rendered/$(basename "$file")"
done
```

CLI example (register all task definitions):

```bash
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/identity-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/enrollment-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/department-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/sports-participation-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/event-configuration-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/scheduling-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/scoring-service.json
aws ecs register-task-definition --cli-input-json file://task-defs/rendered/reporting-service.json
```

### 12) Create an Application Load Balancer

Create an ALB with one target group per service (ports 8001–8008).

Create listeners:
- HTTPS 443 (use existing `CERT_ARN` from step 3) → default fixed 404
- HTTPS 443 rules for `/identities`, `/enrollments`, `/departments`, `/sports-participations`,
  `/event-configurations`, `/schedulings`, `/scorings`, `/reportings`

If you prefer HTTP-only, create an HTTP listener with a fixed 404 default action
and skip the HTTPS variant.

CLI example:

```bash
ALB_SG_ID=$(aws ec2 create-security-group \
  --group-name "${NAME_PREFIX}-alb" \
  --description "ALB security group" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id "$ECS_SG_ID" \
  --protocol tcp --port 8001-8008 \
  --source-group "$ALB_SG_ID"

ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "${NAME_PREFIX}-alb" \
  --subnets "$PUB_SUBNET_A" "$PUB_SUBNET_B" \
  --security-groups "$ALB_SG_ID" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

IDENTITY_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-id" \
  --protocol HTTP --port 8001 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
ENROLLMENT_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-enr" \
  --protocol HTTP --port 8002 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
DEPARTMENT_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-dep" \
  --protocol HTTP --port 8003 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
SPORTS_PARTICIPATION_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-sp" \
  --protocol HTTP --port 8004 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
EVENT_CONFIGURATION_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-evt" \
  --protocol HTTP --port 8005 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
SCHEDULING_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-sch" \
  --protocol HTTP --port 8006 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
SCORING_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-sco" \
  --protocol HTTP --port 8007 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
REPORTING_TG_ARN=$(aws elbv2 create-target-group \
  --name "${NAME_PREFIX}-rep" \
  --protocol HTTP --port 8008 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS --port 443 \
  --certificate-arn "$CERT_ARN" \
  --default-actions Type=fixed-response,FixedResponseConfig={StatusCode=404,ContentType=text/plain,MessageBody="Not Found"} \
  --query 'Listeners[0].ListenerArn' --output text)

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 10 \
  --conditions Field=path-pattern,Values="/identities*" \
  --actions Type=forward,TargetGroupArn="$IDENTITY_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 20 \
  --conditions Field=path-pattern,Values="/enrollments*" \
  --actions Type=forward,TargetGroupArn="$ENROLLMENT_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 30 \
  --conditions Field=path-pattern,Values="/departments*" \
  --actions Type=forward,TargetGroupArn="$DEPARTMENT_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 40 \
  --conditions Field=path-pattern,Values="/sports-participations*" \
  --actions Type=forward,TargetGroupArn="$SPORTS_PARTICIPATION_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 50 \
  --conditions Field=path-pattern,Values="/event-configurations*" \
  --actions Type=forward,TargetGroupArn="$EVENT_CONFIGURATION_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 60 \
  --conditions Field=path-pattern,Values="/schedulings*" \
  --actions Type=forward,TargetGroupArn="$SCHEDULING_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 70 \
  --conditions Field=path-pattern,Values="/scorings*" \
  --actions Type=forward,TargetGroupArn="$SCORING_TG_ARN"

aws elbv2 create-rule \
  --listener-arn "$LISTENER_ARN" \
  --priority 80 \
  --conditions Field=path-pattern,Values="/reportings*" \
  --actions Type=forward,TargetGroupArn="$REPORTING_TG_ARN"
```

### 13) Create ECS Services

Create services in the cluster (Fargate, private subnets), one per microservice → attach to its target group.

Set desired count to 1+ and enable autoscaling as needed.

CLI example:

```bash
aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-identity-service" \
  --task-definition "${NAME_PREFIX}-identity-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$IDENTITY_TG_ARN,containerName=identity-service,containerPort=8001" \
  --service-registries "registryArn=$IDENTITY_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-enrollment-service" \
  --task-definition "${NAME_PREFIX}-enrollment-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$ENROLLMENT_TG_ARN,containerName=enrollment-service,containerPort=8002" \
  --service-registries "registryArn=$ENROLLMENT_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-department-service" \
  --task-definition "${NAME_PREFIX}-department-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$DEPARTMENT_TG_ARN,containerName=department-service,containerPort=8003" \
  --service-registries "registryArn=$DEPARTMENT_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-sports-participation-service" \
  --task-definition "${NAME_PREFIX}-sports-participation-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$SPORTS_PARTICIPATION_TG_ARN,containerName=sports-participation-service,containerPort=8004" \
  --service-registries "registryArn=$SPORTS_PARTICIPATION_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-event-configuration-service" \
  --task-definition "${NAME_PREFIX}-event-configuration-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$EVENT_CONFIGURATION_TG_ARN,containerName=event-configuration-service,containerPort=8005" \
  --service-registries "registryArn=$EVENT_CONFIGURATION_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-scheduling-service" \
  --task-definition "${NAME_PREFIX}-scheduling-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$SCHEDULING_TG_ARN,containerName=scheduling-service,containerPort=8006" \
  --service-registries "registryArn=$SCHEDULING_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-scoring-service" \
  --task-definition "${NAME_PREFIX}-scoring-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$SCORING_TG_ARN,containerName=scoring-service,containerPort=8007" \
  --service-registries "registryArn=$SCORING_SD_ARN"

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${NAME_PREFIX}-reporting-service" \
  --task-definition "${NAME_PREFIX}-reporting-service" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIV_SUBNET_A,$PRIV_SUBNET_B],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$REPORTING_TG_ARN,containerName=reporting-service,containerPort=8008" \
  --service-registries "registryArn=$REPORTING_SD_ARN"
```

### 14) DNS Setup (API domain)

Create a DNS record:
- `api.your-domain.com` → ALB (optional API domain)

CLI example (Route 53 alias record):

```bash
ROUTE53_ZONE_ID=<your-hosted-zone-id>

ALB_DNS_NAME=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].DNSName' --output text)
ALB_ZONE_ID=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)

aws route53 change-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" --change-batch '{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.your-domain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "'"$ALB_ZONE_ID"'",
          "DNSName": "'"$ALB_DNS_NAME"'",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}'
```

### 15) Verify

```bash
curl -I https://your-api-domain.com/identities/docs
```

If you are using HTTP (no TLS), test the API with the ALB DNS name:

```bash
ALB_DNS_NAME=$(aws elbv2 describe-load-balancers --names "${NAME_PREFIX}-alb" --query 'LoadBalancers[0].DNSName' --output text)

curl -I "http://$ALB_DNS_NAME/identities/docs"
```

## Teardown

Run the following steps in order to avoid dependency errors.

```bash
# Reuse CLUSTER_NAME, NAME_PREFIX, and SERVICE_NAMESPACE from Step 3.
```

### 1) Delete ECS Services

```bash
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-identity-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-enrollment-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-department-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-sports-participation-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-event-configuration-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-scheduling-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-scoring-service" --force
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "${NAME_PREFIX}-reporting-service" --force

aws ecs wait services-inactive --cluster "$CLUSTER_NAME" --services \
  "${NAME_PREFIX}-identity-service" \
  "${NAME_PREFIX}-enrollment-service" \
  "${NAME_PREFIX}-department-service" \
  "${NAME_PREFIX}-sports-participation-service" \
  "${NAME_PREFIX}-event-configuration-service" \
  "${NAME_PREFIX}-scheduling-service" \
  "${NAME_PREFIX}-scoring-service" \
  "${NAME_PREFIX}-reporting-service"
```

### 2) Deregister Task Definitions (Optional)

```bash
for family in \
  "${NAME_PREFIX}-identity-service" \
  "${NAME_PREFIX}-enrollment-service" \
  "${NAME_PREFIX}-department-service" \
  "${NAME_PREFIX}-sports-participation-service" \
  "${NAME_PREFIX}-event-configuration-service" \
  "${NAME_PREFIX}-scheduling-service" \
  "${NAME_PREFIX}-scoring-service" \
  "${NAME_PREFIX}-reporting-service"; do
  for arn in $(aws ecs list-task-definitions --family-prefix "$family" --query 'taskDefinitionArns[]' --output text); do
    aws ecs deregister-task-definition --task-definition "$arn"
  done
done
```

### 3) Delete Route 53 Records (Optional)

If you created Route 53 records, delete the API record before removing the ALB:

```bash
ROUTE53_ZONE_ID=<your-hosted-zone-id>
ALB_ARN=$(aws elbv2 describe-load-balancers --names "${NAME_PREFIX}-alb" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
ALB_DNS_NAME=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].DNSName' --output text)
ALB_ZONE_ID=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)

aws route53 change-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" --change-batch '{
  "Changes": [
    {
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "api.your-domain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "'"$ALB_ZONE_ID"'",
          "DNSName": "'"$ALB_DNS_NAME"'",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}'
```

### 4) Delete ALB Listener Rules, Listener, Target Groups, and ALB

```bash
ALB_ARN=$(aws elbv2 describe-load-balancers --names "${NAME_PREFIX}-alb" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --query 'Listeners[0].ListenerArn' --output text)

for rule_arn in $(aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" --query 'Rules[?IsDefault==`false`].RuleArn' --output text); do
  aws elbv2 delete-rule --rule-arn "$rule_arn"
done

aws elbv2 delete-listener --listener-arn "$LISTENER_ARN"

for tg_arn in $(aws elbv2 describe-target-groups --names \
  "${NAME_PREFIX}-id" \
  "${NAME_PREFIX}-enr" \
  "${NAME_PREFIX}-dep" \
  "${NAME_PREFIX}-sp" \
  "${NAME_PREFIX}-evt" \
  "${NAME_PREFIX}-sch" \
  "${NAME_PREFIX}-sco" \
  "${NAME_PREFIX}-rep" \
  --query 'TargetGroups[].TargetGroupArn' --output text); do
  aws elbv2 delete-target-group --target-group-arn "$tg_arn"
done

aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN"

aws elbv2 wait load-balancers-deleted --load-balancer-arns "$ALB_ARN"
```

### 5) Delete Cloud Map Services and Namespace

```bash
NAMESPACE_ID=$(aws servicediscovery list-namespaces --query "Namespaces[?Name=='${SERVICE_NAMESPACE}'].Id | [0]" --output text)

for svc_id in $(aws servicediscovery list-services --filters Name=NAMESPACE_ID,Values="$NAMESPACE_ID",Condition=EQ --query 'Services[].Id' --output text); do
  aws servicediscovery delete-service --id "$svc_id"
done

aws servicediscovery delete-namespace --id "$NAMESPACE_ID"
```

### 6) Delete ElastiCache Redis

```bash
aws elasticache delete-cache-cluster --cache-cluster-id "${NAME_PREFIX}-redis"
aws elasticache wait cache-cluster-deleted --cache-cluster-id "${NAME_PREFIX}-redis"
aws elasticache delete-cache-subnet-group --cache-subnet-group-name "${NAME_PREFIX}-redis"
```

### 7) Delete ECS Cluster

```bash
aws ecs delete-cluster --cluster "$CLUSTER_NAME"
```

### 8) Delete CloudWatch Log Groups

```bash
for name in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  aws logs delete-log-group --log-group-name "/ecs/${NAME_PREFIX}/${name}"
done
```

### 9) Delete Security Groups

```bash
for sg_id in $(aws ec2 describe-security-groups --filters Name=group-name,Values="${NAME_PREFIX}-alb","${NAME_PREFIX}-ecs-tasks","${NAME_PREFIX}-redis" --query 'SecurityGroups[].GroupId' --output text); do
  aws ec2 delete-security-group --group-id "$sg_id"
done
```

### 10) Delete VPC Resources

```bash
VPC_ID=${VPC_ID:-$(aws ec2 describe-vpcs --filters Name=tag:Name,Values="${NAME_PREFIX}-vpc" --query 'Vpcs[0].VpcId' --output text)}

NAT_ID=$(aws ec2 describe-nat-gateways --filter Name=vpc-id,Values="$VPC_ID" --query 'NatGateways[0].NatGatewayId' --output text)
EIP_ALLOC_ID=$(aws ec2 describe-nat-gateways --nat-gateway-ids "$NAT_ID" --query 'NatGateways[0].NatGatewayAddresses[0].AllocationId' --output text)
aws ec2 delete-nat-gateway --nat-gateway-id "$NAT_ID"
aws ec2 wait nat-gateway-deleted --nat-gateway-ids "$NAT_ID"
aws ec2 release-address --allocation-id "$EIP_ALLOC_ID"

IGW_ID=$(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values="$VPC_ID" --query 'InternetGateways[0].InternetGatewayId' --output text)
aws ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID"

for subnet_id in $(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[].SubnetId' --output text); do
  aws ec2 delete-subnet --subnet-id "$subnet_id"
done

for rt_id in $(aws ec2 describe-route-tables --filters Name=vpc-id,Values="$VPC_ID" --query 'RouteTables[?Associations[?Main==`false`]].RouteTableId' --output text); do
  aws ec2 delete-route-table --route-table-id "$rt_id"
done

aws ec2 delete-vpc --vpc-id "$VPC_ID"
```

### 11) Delete ECR Repositories

```bash
aws ecr delete-repository --repository-name ${NAME_PREFIX}-identity-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-enrollment-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-department-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-sports-participation-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-event-configuration-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-scheduling-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-scoring-service --force
aws ecr delete-repository --repository-name ${NAME_PREFIX}-reporting-service --force
```

### 12) Delete Secrets (Optional)

```bash
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-jwt --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-mongo-uri --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-gmail-app-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-sendgrid-api-key --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-resend-api-key --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ${NAME_PREFIX}-smtp-password --force-delete-without-recovery
```

### 13) Delete IAM Roles (Optional)

```bash
aws iam detach-role-policy \
  --role-name "${NAME_PREFIX}-task-execution" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role-policy --role-name "${NAME_PREFIX}-task-execution" --policy-name ecs-secrets-policy
aws iam delete-role --role-name "${NAME_PREFIX}-task-execution"
aws iam delete-role --role-name "${NAME_PREFIX}-task-role"
```

## Best Practices Notes
- Use MongoDB Atlas instead of self-hosting for production.
- Store secrets in AWS Secrets Manager and reference them in task defs.
- Use private subnets for tasks and restrict SGs to ALB only.
- Pin image tags (avoid `latest`) and enable ECR image scanning.

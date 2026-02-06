# Ubuntu - Kubernetes Prerequisites (Beginner)

This guide helps you set up the tools needed before deploying the app to Kubernetes.

## Option A: Minikube (Local, easiest)

### 1) Install Docker Engine

If Docker is not installed yet, follow:
- `docs/setup/ubuntu/docker-engine-install.md`

### 2) Install kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client
```

### 3) Install Minikube

```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
minikube version
```

### 4) Start Minikube

```bash
minikube start --driver=docker
kubectl get nodes
```

### 5) Enable Ingress (optional)

```bash
minikube addons enable ingress
```

---

## Option B: k3s (Lightweight server)

### 1) Install k3s

```bash
curl -sfL https://get.k3s.io | sh -
```

### 2) Use kubectl

k3s installs kubectl and configures it automatically:

```bash
sudo kubectl get nodes
```

If you want to use your local user:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
kubectl get nodes
```

---

## Option C: Managed Kubernetes (EKS/GKE/AKS)

- Provision your cluster in the cloud provider console
- Download kubeconfig and verify:

```bash
kubectl get nodes
```

---

## Required Tools Summary

- `kubectl` configured to reach your cluster
- Container registry access (Docker Hub/GHCR/ECR)
- For local clusters: Docker + Minikube or k3s

Once these are ready, continue with `docs/setup/ubuntu/kubernetes.md`.

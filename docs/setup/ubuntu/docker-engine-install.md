# Ubuntu - Install Docker Engine + Compose

These steps install Docker Engine and the Compose plugin on Ubuntu/Debian.

## 1) Install Docker Engine

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 2) Start and Enable Docker

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

## 3) Allow Non-root Access (Recommended)

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 4) Verify Installation

```bash
docker --version
docker compose version
docker run --rm hello-world
```

# Ubuntu - kubectl Port-Forward (systemd)

Use this if you want the NGINX gateway port-forward to keep running after you close your SSH session, and to survive a VM reboot.

## 1) Create Port-Forward Service

```bash
sudo tee /etc/systemd/system/annual-sports-nginx-forward.service >/dev/null <<'EOF'
[Unit]
Description=Port forward annual-sports nginx gateway
After=network.target minikube.service
Wants=minikube.service

[Service]
Type=simple
User=ubuntu
Environment=KUBECONFIG=/home/ubuntu/.kube/config
ExecStart=/usr/local/bin/kubectl -n annual-sports port-forward svc/annual-sports-nginx 8080:80 --address 0.0.0.0
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now annual-sports-nginx-forward
sudo systemctl status annual-sports-nginx-forward
```

## 2) Start Minikube on Boot

```bash
sudo tee /etc/systemd/system/minikube.service >/dev/null <<'EOF'
[Unit]
Description=Minikube
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=ubuntu
Environment=KUBECONFIG=/home/ubuntu/.kube/config
ExecStart=/usr/local/bin/minikube start --driver=docker
ExecStop=/usr/local/bin/minikube stop

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now minikube
```

You do not need to stop an already running minikube before enabling the service. If you want systemd to take full control, you can restart it:

```bash
sudo systemctl restart minikube
```

## 3) Restart Port-Forward (After Minikube)

```bash
sudo systemctl stop annual-sports-nginx-forward
sudo systemctl enable --now annual-sports-nginx-forward
```

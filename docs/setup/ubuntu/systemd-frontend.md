# Ubuntu - Frontend systemd Service

Runs the production frontend using Vite preview. Use Nginx for HTTPS and standard ports.

## 1) Configure Environment

Create `frontend/.env` and set `VITE_API_URL` before building:

```bash
cd /var/www/annual-sports-event-full/new-structure/frontend
printf "VITE_API_URL=/\n" > .env
```

## 2) Build the Frontend

```bash
cd /var/www/annual-sports-event-full/new-structure/frontend
npm install
npm run build
```

## 3) Create systemd Service

```bash
sudo nano /etc/systemd/system/annual-sports-frontend.service
```

Paste:

```ini
[Unit]
Description=Annual Sports Frontend - Vite Preview Server
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/var/www/annual-sports-event-full/new-structure/frontend
Environment=NODE_ENV=production
Environment=PORT=5173
ExecStart=/usr/bin/npm run preview
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=annual-sports-frontend
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

## 4) Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable annual-sports-frontend
sudo systemctl start annual-sports-frontend
sudo systemctl status annual-sports-frontend
```

## 5) Logs

```bash
sudo journalctl -u annual-sports-frontend -f
```

## 6) Restart After Updates

```bash
cd /var/www/annual-sports-event-full/new-structure/frontend
npm install
npm run build
sudo systemctl restart annual-sports-frontend
```

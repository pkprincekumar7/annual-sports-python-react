# Ubuntu - Department Service (systemd)

Runs the Department FastAPI service as a systemd unit.

## 1) Prerequisites

- MongoDB and Redis running (see `docs/setup/ubuntu/quick-start.md`)
- Python 3.12+

## 2) Configure Environment

```bash
cd /var/www/annual-sports-event-full/new-structure/department-service
cp .env.example .env
nano .env
```

Common values:
- `MONGODB_URI`
- `DATABASE_NAME`
- `JWT_SECRET`
- `REDIS_URL`

## 3) Install Dependencies

```bash
pip install -r requirements.txt
```

## 4) Create systemd Service

```bash
sudo nano /etc/systemd/system/annual-sports-department.service
```

Paste:

```ini
[Unit]
Description=Annual Sports Department Service
After=network.target mongod.service redis-server.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/var/www/annual-sports-event-full/new-structure/department-service
EnvironmentFile=/var/www/annual-sports-event-full/new-structure/department-service/.env
ExecStart=/usr/bin/env uvicorn main:app --host 0.0.0.0 --port 8003
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=annual-sports-department
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

## 5) Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable annual-sports-department
sudo systemctl start annual-sports-department
sudo systemctl status annual-sports-department
```

## 6) Logs

```bash
sudo journalctl -u annual-sports-department -f
```

## 7) Restart After Updates

```bash
cd /var/www/annual-sports-event-full/new-structure/department-service
pip install -r requirements.txt
sudo systemctl restart annual-sports-department
```

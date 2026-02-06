# Ubuntu - Scheduling Service (systemd)

Runs the Scheduling FastAPI service as a systemd unit.

## 1) Prerequisites

- MongoDB and Redis running (see `docs/setup/ubuntu/quick-start.md`)
- Python 3.12+

## 2) Configure Environment

```bash
cd /var/www/annual-sports-event-full/new-structure/scheduling-service
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
sudo nano /etc/systemd/system/annual-sports-scheduling.service
```

Paste:

```ini
[Unit]
Description=Annual Sports Scheduling Service
After=network.target mongod.service redis-server.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/var/www/annual-sports-event-full/new-structure/scheduling-service
EnvironmentFile=/var/www/annual-sports-event-full/new-structure/scheduling-service/.env
ExecStart=/usr/bin/env uvicorn main:app --host 0.0.0.0 --port 8006
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=annual-sports-scheduling
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

## 5) Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable annual-sports-scheduling
sudo systemctl start annual-sports-scheduling
sudo systemctl status annual-sports-scheduling
```

## 6) Logs

```bash
sudo journalctl -u annual-sports-scheduling -f
```

## 7) Restart After Updates

```bash
cd /var/www/annual-sports-event-full/new-structure/scheduling-service
pip install -r requirements.txt
sudo systemctl restart annual-sports-scheduling
```

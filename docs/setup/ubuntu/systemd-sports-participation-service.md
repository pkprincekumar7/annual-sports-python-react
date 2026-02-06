# Ubuntu - Sports Participation Service (systemd)

Runs the Sports Participation FastAPI service as a systemd unit.

## 1) Prerequisites

- MongoDB and Redis running (see `docs/setup/ubuntu/quick-start.md`)
- Python 3.12+

## 2) Configure Environment

```bash
cd /var/www/annual-sports-event-full/new-structure/sports-participation-service
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
sudo nano /etc/systemd/system/annual-sports-sports-participation.service
```

Paste:

```ini
[Unit]
Description=Annual Sports Sports Participation Service
After=network.target mongod.service redis-server.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/var/www/annual-sports-event-full/new-structure/sports-participation-service
EnvironmentFile=/var/www/annual-sports-event-full/new-structure/sports-participation-service/.env
ExecStart=/usr/bin/env uvicorn main:app --host 0.0.0.0 --port 8004
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=annual-sports-sports-participation
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

## 5) Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable annual-sports-sports-participation
sudo systemctl start annual-sports-sports-participation
sudo systemctl status annual-sports-sports-participation
```

## 6) Logs

```bash
sudo journalctl -u annual-sports-sports-participation -f
```

## 7) Restart After Updates

```bash
cd /var/www/annual-sports-event-full/new-structure/sports-participation-service
pip install -r requirements.txt
sudo systemctl restart annual-sports-sports-participation
```

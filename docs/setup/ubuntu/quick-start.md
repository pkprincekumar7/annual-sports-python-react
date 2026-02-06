# Ubuntu Quick Start (Local)

Use this for local development on Ubuntu/Debian.

## Prerequisites
- Node.js 24+ (24 LTS recommended)
- npm (included with Node.js)
- Python 3.12+
- MongoDB (local or remote)
- Redis (local or remote)
- Git

## 1) Install Node.js 24

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
node --version
npm --version
```

## 2) Install MongoDB (Local)

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
```

## 3) Install Redis (Local)

```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## 4) Clone and Install Dependencies

```bash
cd /var/www
sudo git clone <your-repo-url> annual-sports-event-full
sudo chown -R $USER:$USER annual-sports-event-full
cd annual-sports-event-full/new-structure
```

## 5) Configure Environment

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
  cp "$service/.env.example" "$service/.env"
done
```

Update each `.env` with required secret values:
- `MONGODB_URI`
- `JWT_SECRET`
- Identity service email secrets (one provider only)

See `docs/setup/env-setup.md` for details.

## 6) Run with Docker Compose (Recommended)

```bash
docker compose up --build
```

Open `http://localhost:8080`.

Notes for Docker Compose:
- Non-secret settings are defined in `docker-compose.yml`; `.env` files hold secrets only.
- MongoDB is not included in the Compose file; use a managed MongoDB or add one.

## 7) Run Services Locally (No Docker)

Start each service in its own terminal:

```bash
cd /var/www/annual-sports-event-full/new-structure/identity-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Start the remaining services with their ports:
- Enrollment: `8002`
- Department: `8003`
- Sports Participation: `8004`
- Event Configuration: `8005`
- Scheduling: `8006`
- Scoring: `8007`
- Reporting: `8008`

Start the frontend:

```bash
cd /var/www/annual-sports-event-full/new-structure/frontend
npm install
npm run dev
```

If you are using the Vite dev server, API calls are proxied to the service ports above.

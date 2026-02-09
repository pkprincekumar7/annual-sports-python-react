# Windows Quick Start (Local)

Use this for local development on Windows.

## Prerequisites
- Node.js 24+ (24 LTS recommended)
- Python 3.12+
- MongoDB Community Server (local or remote)
- Redis (local or remote)
- Git

## 1) Install Node.js

Download and install from: https://nodejs.org/

Verify:
```powershell
node --version
npm --version
```

## 2) Install MongoDB (Local)

Download and install from: https://www.mongodb.com/try/download/community

Start the MongoDB service from Services or run:
```powershell
net start MongoDB
```

## 3) Install Redis (Local)

Redis is not officially supported on Windows. Use one of:
- Docker: `docker run --name redis -p 6379:6379 -d redis:7-alpine`
- WSL + Redis
- A managed Redis service

## 4) Clone and Install Dependencies

```powershell
cd C:\
git clone <your-repo-url> annual-sports-python-react
cd annual-sports-python-react
```

## 5) Configure Environment

```powershell
foreach ($svc in @(
  "identity-service",
  "enrollment-service",
  "department-service",
  "sports-participation-service",
  "event-configuration-service",
  "scheduling-service",
  "scoring-service",
  "reporting-service"
)) {
  Copy-Item "$svc\.env.example" "$svc\.env"
}
```

Update each `.env` with required secret values:
- `MONGODB_URI`
- `JWT_SECRET`
- Identity service email secrets (one provider only)

See `docs/setup/env-setup.md` for details.

## 6) Run with Docker Compose (Recommended)

```powershell
docker compose up --build
```

Open `http://localhost:8080`.

Notes for Docker Compose:
- Non-secret settings are defined in `docker-compose.yml`; `.env` files hold secrets only.
- MongoDB is not included in the Compose file; use a managed MongoDB or add one.

## 7) Run Services Locally (No Docker)

Start each service in its own terminal:

```powershell
cd C:\annual-sports-python-react\identity-service
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

```powershell
cd C:\annual-sports-python-react\frontend
npm install
npm run dev
```

If you are using the Vite dev server, API calls are proxied to the service ports above.

# macOS Quick Start (Local)

Use this for local development on macOS.

## Prerequisites
- Homebrew
- Node.js 24+ (24 LTS recommended)
- Python 3.12+
- MongoDB (local or remote)
- Redis (local or remote)
- Git

## 1) Install Homebrew (if needed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 2) Install Node.js

```bash
brew install node
node --version
npm --version
```

## 3) Install MongoDB (Local)

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

## 4) Install Redis (Local)

```bash
brew install redis
brew services start redis
```

## 5) Clone and Install Dependencies

```bash
cd ~/projects
git clone <your-repo-url> annual-sports-event-full
cd annual-sports-event-full/new-structure
```

## 6) Configure Environment

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

## 7) Run with Docker Compose (Recommended)

```bash
docker compose up --build
```

Open `http://localhost:8080`.

Notes for Docker Compose:
- Non-secret settings are defined in `docker-compose.yml`; `.env` files hold secrets only.
- MongoDB is not included in the Compose file; use a managed MongoDB or add one.

## 8) Run Services Locally (No Docker)

Start each service in its own terminal:

```bash
cd ~/projects/annual-sports-event-full/new-structure/identity-service
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
cd ~/projects/annual-sports-event-full/new-structure/frontend
npm install
npm run dev
```

If you are using the Vite dev server, API calls are proxied to the service ports above.

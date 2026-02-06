# Ubuntu - Docker Compose (Frontend + Microservices)

Run the full stack using Docker Compose.

## Prerequisites
- Docker Engine + Compose installed (`new-structure/docs/setup/ubuntu/docker-engine-install.md`)
- `.env` configured for each service (copy from `.env.example`)

## 1) Start Containers

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose up --build
```

## 2) Run in Background (Detached)

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose up -d --build
```

## 3) Rebuild Images (No Cache)

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose build --no-cache
```

## 4) Restart Containers

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose restart
```

## 5) Rebuild and Restart (One-liner)

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose up -d --build --force-recreate
```

## 6) Stop and Remove

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose down
```

## 7) Follow Logs

```bash
cd /var/www/annual-sports-event-full/new-structure
docker compose logs -f
```

## Ports
- Gateway (Nginx + frontend): `http://localhost:8080`
- Identity: `http://localhost:8001`
- Enrollment: `http://localhost:8002`
- Department: `http://localhost:8003`
- Sports Participation: `http://localhost:8004`
- Event Configuration: `http://localhost:8005`
- Scheduling: `http://localhost:8006`
- Scoring: `http://localhost:8007`
- Reporting: `http://localhost:8008`

## Notes
- The compose file runs Redis plus all services and the frontend gateway.
- MongoDB is not included. Use a managed MongoDB or add a MongoDB service and update `MONGODB_URI`.
- Service-to-service URLs must use Compose DNS names (e.g., `http://identity-service:8001`) instead of `localhost`.
- Non-secret settings are defined in `docker-compose.yml`; `.env` files hold secrets only.
- The frontend build uses `VITE_API_URL=/` and Nginx routes base paths like `/identities` to each service.
- `VITE_API_URL` is a build-time value; changing it requires a rebuild.

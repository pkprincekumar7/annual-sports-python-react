# macOS - Docker Compose (Frontend + Microservices)

## Prerequisites
- Docker Desktop installed and running (`macos/docker-desktop.md`)
- `.env` configured for each service (copy from `.env.example`)

## Start Containers

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose up --build
```

## Detached Mode

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose up -d --build
```

## Rebuild Images (No Cache)

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose build --no-cache
```

## Restart / Stop

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose restart
```

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose down
```

## Logs

```bash
cd ~/projects/annual-sports-event-full/new-structure
docker compose logs -f
```

## Ports
- Gateway (Nginx + frontend): `http://localhost:5173`
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
- Set `REDIS_URL=redis://redis:6379/0` when running in Compose.
- The frontend build uses `VITE_API_URL=/` and Nginx routes base paths like `/identities` to each service.
- `VITE_API_URL` is a build-time value; changing it requires a rebuild.

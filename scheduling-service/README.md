## Scheduling Service

FastAPI service for event scheduling. This ports `routes/eventSchedule.js` and its supporting
utilities (match validation, gender derivation, and cache handling).

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8006`

### Required Services

- Event Configuration Service: `EVENT_CONFIGURATION_URL`
- Sports Participation Service: `SPORTS_PARTICIPATION_URL`
- Identity Service: `IDENTITY_URL`
- Scoring Service (optional for cache parity): `SCORING_URL`
- Redis: `REDIS_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.
### Endpoints

- `GET /schedulings/event-schedule/{sport}`
- `GET /schedulings/event-schedule/{sport}/teams-players`
- `POST /schedulings/event-schedule`
- `PUT /schedulings/event-schedule/{match_id}`
- `DELETE /schedulings/event-schedule/{match_id}`

### API Docs (Swagger)

- Local UI: `http://localhost:8006/schedulings/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/schedulings/docs`
- Nginx Spec: `http://localhost:8080/schedulings/swagger.yml`

### Checklist

- Match validation mirrors legacy scheduling rules
- Gender derivation uses participant data from external services
- Cache invalidation follows the Node.js behavior

### Smoke Test

```sh
chmod +x scripts/smoke-test.sh
ADMIN_TOKEN=... EVENT_ID=... SPORT_NAME=... ./scripts/smoke-test.sh
```

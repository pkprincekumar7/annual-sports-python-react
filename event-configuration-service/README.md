## Event Configuration Service

FastAPI service for event year management. This ports routes from `routes/eventYears.js`.

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8005`

### Required Services

- Identity Service: `IDENTITY_URL`
- Redis: `REDIS_URL`

Optional integrations for delete validation:

- Sports Participation Service: `SPORTS_PARTICIPATION_URL`
- Scheduling Service: `SCHEDULING_URL`
- Scoring Service: `SCORING_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.
### Endpoints

- `GET /event-configurations/event-years`
- `GET /event-configurations/event-years/active`
- `POST /event-configurations/event-years`
- `PUT /event-configurations/event-years/{event_id}`
- `DELETE /event-configurations/event-years/{event_id}`

### API Docs (Swagger)

- Local UI: `http://localhost:8005/event-configurations/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/event-configurations/docs`
- Nginx Spec: `http://localhost:8080/event-configurations/swagger.yml`

### Checklist

- `GET /event-configurations/event-years/active` caches active year and validates dates
- `POST /event-configurations/event-years` enforces date relationships and future starts
- `PUT /event-configurations/event-years/{event_id}` respects update windows and date locks
- `DELETE /event-configurations/event-years/{event_id}` blocks when related data exists

### Smoke Test

Run the script below after setting `.env` and starting the service:

```sh
chmod +x scripts/smoke-test.sh
ADMIN_TOKEN=... EVENT_YEAR=2026 REG_START_DATE=2026-01-01 REG_END_DATE=2026-01-10 EVENT_START_DATE=2026-01-11 EVENT_END_DATE=2026-01-20 ./scripts/smoke-test.sh
```

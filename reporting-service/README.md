## Reporting Service

FastAPI service for Excel export. This ports `routes/exports.js` and recreates the
player participation and batch lookups for report generation.

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8008`

### Required Services

- Event Configuration Service: `EVENT_CONFIGURATION_URL`
- Sports Participation Service: `SPORTS_PARTICIPATION_URL`
- Enrollment Service: `ENROLLMENT_URL`
- Identity Service: `IDENTITY_URL`
- Redis: `REDIS_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.
### Endpoints

- `GET /reportings/export-excel`

### API Docs (Swagger)

- Local UI: `http://localhost:8008/reportings/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/reportings/docs`
- Nginx Spec: `http://localhost:8080/reportings/swagger.yml`

### Checklist

- Excel columns mirror legacy export (sports + team columns)
- Participation is computed from sports participation data

### Smoke Test

```sh
chmod +x scripts/smoke-test.sh
ADMIN_TOKEN=... EVENT_ID=... ./scripts/smoke-test.sh
```

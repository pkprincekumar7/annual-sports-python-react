## Enrollment Service

FastAPI service for batch management. This ports routes from `routes/batches.js`.

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8002`

### Required Services

- Identity Service: `IDENTITY_URL`
- Event Configuration Service: `EVENT_CONFIGURATION_URL`
- Redis: `REDIS_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.

### Endpoints

- `POST /enrollments/add-batch`
- `DELETE /enrollments/remove-batch`
- `GET /enrollments/batches`
- `POST /enrollments/batches/assign-player`
- `POST /enrollments/batches/unassign-player`
- `POST /enrollments/batches/unassign-players`

### API Docs (Swagger)

- Local UI: `http://localhost:8002/enrollments/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/enrollments/docs`
- Nginx Spec: `http://localhost:8080/enrollments/swagger.yml`

### Checklist

- `POST /enrollments/add-batch` enforces admin + registration period
- `DELETE /enrollments/remove-batch` blocks deletion when players exist
- `GET /enrollments/batches` returns cached list with players array
- `POST /enrollments/batches/assign-player` assigns player to a batch
- `POST /enrollments/batches/unassign-player` removes player from a batch
- `POST /enrollments/batches/unassign-players` removes players from batches

### Smoke Test

Run the script below after setting `.env` and starting the service:

```sh
chmod +x scripts/smoke-test.sh
ADMIN_TOKEN=... EVENT_ID=... ./scripts/smoke-test.sh
```

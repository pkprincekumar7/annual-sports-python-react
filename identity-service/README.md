## Identity Service

FastAPI service for authentication and player management. This ports routes from `routes/auth.js` and `routes/players.js`.

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8001`

### Required Services

- Event Configuration Service: `EVENT_CONFIGURATION_URL`
- Sports Participation Service: `SPORTS_PARTICIPATION_URL`
- Enrollment Service: `ENROLLMENT_URL`
- Department Service: `DEPARTMENT_URL`
- Scheduling Service: `SCHEDULING_URL`
- Redis: `REDIS_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.

### Endpoints

- `POST /identities/login`
- `POST /identities/change-password`
- `POST /identities/reset-password`
- `GET /identities/me`
- `GET /identities/players`
- `POST /identities/save-player`
- `PUT /identities/update-player`
- `POST /identities/bulk-player-enrollments`
- `DELETE /identities/delete-player/{reg_number}`
- `POST /identities/bulk-delete-players`

### API Docs (Swagger)

- Local UI: `http://localhost:8001/identities/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/identities/docs`
- Nginx Spec: `http://localhost:8080/identities/swagger.yml`

### Checklist

- `POST /identities/login` returns `token`, `player`, and `change_password_required`
- `POST /identities/change-password` enforces auth and clears `change_password_required`
- `POST /identities/reset-password` sends email and updates password
- `GET /identities/me` includes computed fields and `batch_name`
- `GET /identities/players` supports search + pagination + computed fields
- `POST /identities/save-player` validates department + batch + event context
- `PUT /identities/update-player` enforces admin + gender immutability
- `POST /identities/bulk-player-enrollments` returns enrollments + matches
- `DELETE /identities/delete-player/{reg_number}` blocks team/match constraints
- `POST /identities/bulk-delete-players` enforces constraints and returns details

### Smoke Test

Run the script below after setting `.env` and starting the service:

```sh
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```


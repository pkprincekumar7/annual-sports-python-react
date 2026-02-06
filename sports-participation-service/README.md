## Sports Participation Service

FastAPI service for sports, captains, coordinators, teams, and participants. This ports routes from
`routes/sports.js`, `routes/captains.js`, `routes/coordinators.js`, `routes/teams.js`, and `routes/participants.js`.

### Setup

- Install dependencies: `pip install -r requirements.txt`
- Configure environment: copy `.env.example` to `.env` and fill values
- Run locally: `uvicorn main:app --reload --port 8004`

### Required Services

- Event Configuration Service: `EVENT_CONFIGURATION_URL`
- Enrollment Service: `ENROLLMENT_URL`
- Identity Service: `IDENTITY_URL`
- Scheduling Service: `SCHEDULING_URL`
- Scoring Service: `SCORING_URL`
- Redis: `REDIS_URL`

### Auth Propagation

- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
- No per-service tokens are supported.
### Endpoints

- `GET /sports-participations/sports`
- `POST /sports-participations/sports`
- `PUT /sports-participations/sports/{id}`
- `DELETE /sports-participations/sports/{id}`
- `GET /sports-participations/sports-counts`
- `GET /sports-participations/sports/{name}`
- `POST /sports-participations/add-captain`
- `DELETE /sports-participations/remove-captain`
- `GET /sports-participations/captains-by-sport`
- `POST /sports-participations/add-coordinator`
- `DELETE /sports-participations/remove-coordinator`
- `GET /sports-participations/coordinators-by-sport`
- `POST /sports-participations/update-team-participation`
- `GET /sports-participations/teams/{sport}`
- `POST /sports-participations/update-team-player`
- `DELETE /sports-participations/delete-team`
- `POST /sports-participations/validate-participations`
- `GET /sports-participations/participants/{sport}`
- `GET /sports-participations/participants-count/{sport}`
- `GET /sports-participations/player-enrollments/{reg_number}`
- `POST /sports-participations/update-participation`
- `DELETE /sports-participations/remove-participation`

### API Docs (Swagger)

- Local UI: `http://localhost:8004/sports-participations/docs`
- Spec file: `swagger.yaml`
- Nginx UI: `http://localhost:8080/sports-participations/docs`
- Nginx Spec: `http://localhost:8080/sports-participations/swagger.yml`

### Checklist

- Public `/sports-participations/sports` and `/sports-participations/sports/{name}` responses match legacy payloads
- Team validations enforce batch + gender + captain rules
- Coordinator/captain assignment rules mirror legacy logic
- Cache invalidation follows the Node.js behavior

### Smoke Test

Run the script below after setting `.env` and starting the service:

```sh
chmod +x scripts/smoke-test.sh
ADMIN_TOKEN=... EVENT_ID=... REG_NUMBER=... SPORT_TYPE=... SPORT_CATEGORY=... ./scripts/smoke-test.sh
```

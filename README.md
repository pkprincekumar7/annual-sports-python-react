## Annual Sports (New Structure)

This folder contains the FastAPI microservices + Vite frontend for the annual sports application.

### Services

- Identity Service (`identity-service`)
- Enrollment Service (`enrollment-service`)
- Department Service (`department-service`)
- Sports Participation Service (`sports-participation-service`)
- Event Configuration Service (`event-configuration-service`)
- Scheduling Service (`scheduling-service`)
- Scoring Service (`scoring-service`)
- Reporting Service (`reporting-service`)
- Frontend (`frontend`)

### Base Paths (Nginx + Local)

- `/identities`
- `/enrollments`
- `/departments`
- `/sports-participations`
- `/event-configurations`
- `/schedulings`
- `/scorings`
- `/reportings`

### API Docs (Swagger)

- Identity: `http://localhost:8080/identities/docs`
- Enrollment: `http://localhost:8080/enrollments/docs`
- Department: `http://localhost:8080/departments/docs`
- Sports Participation: `http://localhost:8080/sports-participations/docs`
- Event Configuration: `http://localhost:8080/event-configurations/docs`
- Scheduling: `http://localhost:8080/schedulings/docs`
- Scoring: `http://localhost:8080/scorings/docs`
- Reporting: `http://localhost:8080/reportings/docs`

### Prerequisites

- Docker + Docker Compose (recommended for local orchestration)
- Python 3.12+ for running services outside Docker
- Node.js 24+ for the frontend

### Environment Setup

- Each service ships a `.env.example`. Copy it to `.env` and fill secret values.
- Non-secret settings live in `docker-compose.yml`.
- Service-to-service calls forward the incoming `Authorization: Bearer <token>` header.
  No per-service tokens are supported.

### Local Development

Run all services with Docker Compose from this folder:

```sh
docker compose up --build
```

Run a single service locally:

```sh
cd identity-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Run the frontend:

```sh
cd frontend
npm install
npm run dev
```

### Notes

- The API gateway routes to the microservices via `nginx.conf`.
- Each service README includes endpoints, smoke tests, and validation notes.

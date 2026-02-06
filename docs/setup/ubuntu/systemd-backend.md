# Ubuntu - Backend systemd Services (Overview)

The new structure uses multiple FastAPI services. Create one systemd unit per service:

- `systemd-identity-service.md`
- `systemd-enrollment-service.md`
- `systemd-department-service.md`
- `systemd-sports-participation-service.md`
- `systemd-event-configuration-service.md`
- `systemd-scheduling-service.md`
- `systemd-scoring-service.md`
- `systemd-reporting-service.md`

Each guide includes:
- MongoDB/Redis prerequisites
- `.env` configuration
- A dedicated systemd unit file
- Start/restart/log commands

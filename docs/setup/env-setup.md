# Environment Setup (.env)

Each service ships a `.env.example` file. Copy it to `.env` and fill in real values.

## Steps

```bash
for service in \
  identity-service \
  enrollment-service \
  department-service \
  sports-participation-service \
  event-configuration-service \
  scheduling-service \
  scoring-service \
  reporting-service; do
  cp "$service/.env.example" "$service/.env"
done
```

Open each `.env` and update the secret values for your environment. Commonly updated values include:

- `MONGODB_URI`
- `JWT_SECRET`
- `GMAIL_APP_PASSWORD`
- `SENDGRID_API_KEY`
- `RESEND_API_KEY`
- `SMTP_PASSWORD`

## Docker Compose notes

Non-secret settings (service URLs, Redis URLs, app settings) are defined in `docker-compose.yml`.
`.env` files hold secrets only.

MongoDB is not included in the Compose file. Use a managed MongoDB or add a MongoDB
service and point `MONGODB_URI` to it.

If the frontend needs a custom API base URL outside Docker, create `frontend/.env` and set:

```bash
VITE_API_URL=/
```

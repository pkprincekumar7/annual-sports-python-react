# Other Deployment Options

## Frontend: Static Hosting (Vercel/Netlify/S3 + CloudFront)
1. Build the frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Set `VITE_API_URL` at build time to your backend URL.
   This is a build-time value; changing it requires a rebuild.
3. Upload the `dist/` folder to your hosting provider and configure SPA routing.

## Backend: PaaS (Render/Railway/Heroku)
1. Deploy each FastAPI service as its own app.
2. Set secret environment variables from the service `.env.example` files and set
   non-secret values (service URLs, app settings) explicitly in your platform config.
3. Update service-to-service URLs to use your deployed base URLs.
4. Use a start command like:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

## Docker (Without Compose)
1. Build images for services:
   ```bash
   cd /var/www/annual-sports-event-full/new-structure
   for service in \
     identity-service \
     enrollment-service \
     department-service \
     sports-participation-service \
     event-configuration-service \
     scheduling-service \
     scoring-service \
     reporting-service; do
    docker build -t "annual-sports-${service}" "$service"
   done
   ```
2. Build the frontend image:
   ```bash
   docker build -t annual-sports-frontend --build-arg VITE_API_URL=/ frontend
   ```
3. Run containers with required environment variables and port mappings.
   Use service DNS names (or explicit hostnames) for service-to-service URLs.

## Kubernetes (Optional)
Deploy separate Deployments/Services for each microservice, plus MongoDB and Redis.
Set non-secret values via ConfigMaps and secrets via Secrets.

# Ubuntu - Nginx Reverse Proxy

Use Nginx to serve the frontend and proxy API requests to the microservices.
For HTTPS setup with Let's Encrypt, see `docs/setup/ubuntu/nginx-https.md`.

## Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

## Frontend + API Reverse Proxy

You can use **two domains** (frontend + API subdomain) or a **single domain**.
Pick one of the options below.

### Option A: Two domains (frontend + API subdomain)

Frontend site:

```bash
sudo nano /etc/nginx/sites-available/annual-sports-frontend
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

API site:

```bash
sudo nano /etc/nginx/sites-available/annual-sports-api
```

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location = /identities { proxy_pass http://localhost:8001; }
    location ^~ /identities/ { proxy_pass http://localhost:8001; }

    location = /enrollments { proxy_pass http://localhost:8002; }
    location ^~ /enrollments/ { proxy_pass http://localhost:8002; }

    location = /departments { proxy_pass http://localhost:8003; }
    location ^~ /departments/ { proxy_pass http://localhost:8003; }

    location = /sports-participations { proxy_pass http://localhost:8004; }
    location ^~ /sports-participations/ { proxy_pass http://localhost:8004; }

    location = /event-configurations { proxy_pass http://localhost:8005; }
    location ^~ /event-configurations/ { proxy_pass http://localhost:8005; }

    location = /schedulings { proxy_pass http://localhost:8006; }
    location ^~ /schedulings/ { proxy_pass http://localhost:8006; }

    location = /scorings { proxy_pass http://localhost:8007; }
    location ^~ /scorings/ { proxy_pass http://localhost:8007; }

    location = /reportings { proxy_pass http://localhost:8008; }
    location ^~ /reportings/ { proxy_pass http://localhost:8008; }
}
```

Enable the sites:

```bash
sudo ln -s /etc/nginx/sites-available/annual-sports-frontend /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/annual-sports-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: Single domain

Create a single site file:

```bash
sudo nano /etc/nginx/sites-available/annual-sports
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location = /identities { proxy_pass http://localhost:8001; }
    location ^~ /identities/ { proxy_pass http://localhost:8001; }

    location = /enrollments { proxy_pass http://localhost:8002; }
    location ^~ /enrollments/ { proxy_pass http://localhost:8002; }

    location = /departments { proxy_pass http://localhost:8003; }
    location ^~ /departments/ { proxy_pass http://localhost:8003; }

    location = /sports-participations { proxy_pass http://localhost:8004; }
    location ^~ /sports-participations/ { proxy_pass http://localhost:8004; }

    location = /event-configurations { proxy_pass http://localhost:8005; }
    location ^~ /event-configurations/ { proxy_pass http://localhost:8005; }

    location = /schedulings { proxy_pass http://localhost:8006; }
    location ^~ /schedulings/ { proxy_pass http://localhost:8006; }

    location = /scorings { proxy_pass http://localhost:8007; }
    location ^~ /scorings/ { proxy_pass http://localhost:8007; }

    location = /reportings { proxy_pass http://localhost:8008; }
    location ^~ /reportings/ { proxy_pass http://localhost:8008; }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/annual-sports /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Note: If you previously enabled the two-domain sites, disable them to avoid duplicate
`server_name` conflicts, then reload Nginx:

```bash
sudo rm /etc/nginx/sites-enabled/annual-sports-frontend
sudo rm /etc/nginx/sites-enabled/annual-sports-api
sudo nginx -t
sudo systemctl reload nginx
```

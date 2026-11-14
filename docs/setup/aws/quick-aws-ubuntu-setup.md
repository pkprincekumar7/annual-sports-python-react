# Quick AWS Setup on Ubuntu EC2 (HTTPS, no load balancer)

Run the full Docker Compose stack on one **Ubuntu** EC2 instance and serve it at `https://sports.learning-dev.com`:

- Route 53 points the domain at the instance's Elastic IP.
- nginx (in Docker) terminates HTTPS with a free Let's Encrypt certificate that renews automatically.
- No load balancer or CloudFront. See **Cost** under Notes for what you pay.

> An ACM certificate (for example `*.learning-dev.com`) **cannot** be used here. ACM certificates only attach to AWS services such as load balancers and CloudFront, not to an EC2 instance.

Using Amazon Linux instead? See [quick-aws-amazon-linux-setup.md](quick-aws-amazon-linux-setup.md).

## Files used from the repo

- `docker-compose.yml` - the full stack. nginx listens on host port 8080.
- `nginx.prod.conf` - production nginx config:
  - port 80 answers the Let's Encrypt challenge and redirects everything else to HTTPS;
  - port 443 serves the app with the certificate.

  Its upstreams and `location` blocks mirror `nginx.conf`, so when you change `nginx.conf`, make the same change here.
- `docker-compose.prod.yml` - server-only override that publishes ports 80 and 443 and mounts `/etc/letsencrypt` and `/var/www/certbot`. Local `docker compose up` is unaffected.

## Prerequisites

- An AWS account and a Route 53 hosted zone for `learning-dev.com`.
- A MongoDB connection string for the services' `.env` files (for example MongoDB Atlas). MongoDB is not part of `docker-compose.yml`.
- Access to the GitHub repo. If it is private, you need a GitHub personal access token or an SSH deploy key on the server.

---

## Part 1 - AWS

### 1. Launch the instance

Go to **EC2 → Instances → Launch instances** and set:

- Name: `annual-sports`
- AMI: **Ubuntu Server 24.04 LTS**
- Instance type: `t3.small` or larger. Building all services needs about 2 GB of RAM; on smaller types add swap (step 6).
- Key pair: create or choose one, and keep the `.pem` file.
- Network settings → **Create security group** with these inbound rules:
  - SSH 22 from **My IP**
  - HTTP 80 from `0.0.0.0/0`
  - HTTPS 443 from `0.0.0.0/0`
- Storage: 20 GiB gp3.

Click **Launch instance**.

### 2. Elastic IP

Go to **EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**. Then choose **Actions → Associate**, pick the instance, and click **Associate**.

Without this, the public IP changes every time the instance is stopped and started. AWS charges about $0.005 per hour (about $3.60 a month) for every public IPv4 address. The Elastic IP replaces the instance's automatic public IP, so it adds no extra cost while attached. Release it if you delete the instance, because an unattached Elastic IP is still charged.

### 3. Route 53 record

Go to **Route 53 → Hosted zones → learning-dev.com → Create record** and fill in:

- Name: `sports`
- Type: **A**
- Alias: **off**
- Value: the Elastic IP
- TTL: `300`

Click **Create records**. Check it from your machine (it should print the Elastic IP):

```bash
dig +short sports.learning-dev.com
```

### 4. Allow the instance in MongoDB Atlas

If you use MongoDB Atlas, go to **Atlas → Network Access → Add IP Address** and add the Elastic IP (`<elastic-ip>/32`). Without this, every service fails to connect to the database.

---

## Part 2 - Server

### 5. Connect with SSH

On your machine, add this to `~/.ssh/config`:

```
Host annual-sports
  HostName <elastic-ip>
  User ubuntu
  IdentityFile /path/to/your-key.pem
```

Then connect:

```bash
chmod 400 /path/to/your-key.pem && ssh annual-sports
```

All remaining steps run **on the server**. The prompt looks like `ubuntu@ip-172-31-...:~$`.

### 6. Add swap (recommended on 1-2 GB instances)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 7. Install Docker, Compose and git

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg git
```

```bash
sudo install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```bash
sudo systemctl enable --now docker && sudo usermod -aG docker ubuntu
```

Log out and back in so the `docker` group applies, then check:

```bash
docker --version && docker compose version
```

### 8. Get the code

```bash
cd ~ && git clone https://github.com/pkprincekumar7/annual-sports-python-react.git
```

The project is now at `/home/ubuntu/annual-sports-python-react`.

### 9. Configure the services

Each service reads secrets from its own `.env` file. **All 8 services must use the same `MONGODB_URI` and the same `JWT_SECRET`.** The identity service signs login tokens and every other service verifies them, so different secrets make every request after login fail.

Create the `.env` files from the examples:

```bash
cd ~/annual-sports-python-react && for f in */.env.example; do [ -f "${f%.example}" ] || cp "$f" "${f%.example}"; done
```

Set the MongoDB URI and a random JWT secret in all of them at once. The first command asks for the URI, so it doesn't end up in your shell history:

```bash
read -r -p 'MongoDB URI: ' MONGO_URI && JWT=$(openssl rand -hex 32)
```

```bash
for f in */.env; do grep -vE '^(MONGODB_URI|JWT_SECRET)=' "$f" > "$f.tmp" && printf 'MONGODB_URI=%s\nJWT_SECRET=%s\n' "$MONGO_URI" "$JWT" >> "$f.tmp" && mv "$f.tmp" "$f"; done && chmod 600 */.env
```

Check that every service got the same values (it should print `1` twice):

```bash
grep -h '^MONGODB_URI=' */.env | sort -u | wc -l && grep -h '^JWT_SECRET=' */.env | sort -u | wc -l
```

If password-reset emails are needed, set email vars in `identity-service/.env` (Gmail: `GMAIL_USER` and `GMAIL_APP_PASSWORD`):

```bash
nano identity-service/.env
```

See [../env-setup.md](../env-setup.md) for what each variable means.

> `docker-compose.yml` sets the database names (`as-local-identity`, `as-local-enrollment`, ...). If the server uses the same MongoDB cluster as your local setup, both share the same data, including the `admin` user you log in with. To keep them separate, use a different cluster for the server. A new, empty cluster has no `admin` user, so create one before you try to log in.

### 10. Start the app over HTTP and check it

```bash
cd ~/annual-sports-python-react && docker compose up -d --build
```

The first build takes several minutes. Then check that the app responds (it should print `HTTP/1.1 200 OK`):

```bash
curl -I http://localhost:8080/
```

### 11. Install certbot

```bash
sudo apt install -y certbot
```

### 12. Get the certificate

Host port 80 must be free. It is, because the app is still on 8080. The DNS record from step 3 must already resolve (check with `dig`, as in step 3).

```bash
sudo mkdir -p /var/www/certbot && sudo certbot certonly --standalone -d sports.learning-dev.com -m <your-email> --agree-tos -n
```

### 13. Restart the app with HTTPS

```bash
cd ~/annual-sports-python-react && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Open `https://sports.learning-dev.com`. `http://` should redirect to it.

Port 8080 is still published on the host, but it is not in the security group, so nothing outside can reach it.

### 14. Automatic certificate renewal

Certificates expire every 90 days. The certificate was first issued with `--standalone`, but from now on nginx holds port 80, so renewal must use `--webroot`. nginx serves `/.well-known/acme-challenge/` from `/var/www/certbot` (see `nginx.prod.conf`).

**a) Check that renewal works** without actually renewing. It should end with `Congratulations, all simulated renewals succeeded`:

```bash
sudo certbot renew --webroot -w /var/www/certbot --dry-run
```

**b) Reload nginx after every renewal.** certbot runs every script in `/etc/letsencrypt/renewal-hooks/deploy/` after a successful renewal, so nginx picks up the new certificate:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy && printf '#!/bin/sh\ncd /home/ubuntu/annual-sports-python-react && docker compose exec -T nginx nginx -s reload\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Test the hook (it should print `reload-ok`):

```bash
sudo /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && echo reload-ok
```

**c) Schedule renewal.** The certbot package also installs a `certbot.timer`. It would try to renew with the stored `standalone` method, which fails while nginx holds port 80. Turn it off so only the cron job below renews:

```bash
sudo systemctl disable --now certbot.timer
```

Add a weekly job. It renews only when the certificate is within 30 days of expiring, and the hook from (b) then reloads nginx:

```bash
echo '0 3 * * 1 root certbot renew -q --webroot -w /var/www/certbot' | sudo tee /etc/cron.d/certbot-renew
```

Check the job (it should print `active`, then the job line):

```bash
systemctl is-active cron && cat /etc/cron.d/certbot-renew
```

After a renewal you can confirm the new expiry date with `sudo certbot certificates`.

---

## Updating the app later

```bash
cd ~/annual-sports-python-react && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Always use both `-f` files on the server. A plain `docker compose up` falls back to HTTP on 8080 only.

## Notes

- No application code changes are needed. The frontend calls the API on the same origin (`VITE_API_URL: /`), CORS allows all origins, and no IP or URL is hardcoded.
- Never open ports 8080 or 6379 (Redis) in the security group. Only 22, 80 and 443 should be open.
- **Cost:** the EC2 instance, its EBS disk, one public IPv4 address (about $3.60 a month), the Route 53 hosted zone ($0.50 a month), and the yearly domain renewal. Let's Encrypt certificates are free, and creating the `sports` DNS record costs nothing extra. Data transfer out is free up to 100 GB a month.

## Troubleshooting

- **SSH `Permission denied (publickey)`:** check the user is `ubuntu` and the key matches **Key pair assigned at launch** on the instance's Details tab.
- **SSH times out:** your public IP changed. Update the SSH rule's source to **My IP** in the security group.
- **Login works but other pages fail, or every request returns 401/403:** the services have different `JWT_SECRET` values. Re-run the commands in step 9.
- **Services log MongoDB timeout errors:** the Elastic IP is not in Atlas **Network Access** (step 4), or `MONGODB_URI` is wrong.
- **certbot connection or timeout error:** check that the DNS record resolves to the instance, port 80 is open in the security group, and nothing on the host is using port 80 (`sudo ss -ltnp | grep ':80 '`).
- **nginx container keeps restarting after step 13:** the certificate files are missing. Check them with `sudo ls /etc/letsencrypt/live/sports.learning-dev.com/`, then read `docker compose logs nginx`.
- **Build killed or very slow:** the instance is out of memory. Add swap (step 6) or use a larger instance type.
- **API returns "An unexpected error occurred":** read the service's logs, for example `docker compose logs identity-service --tail 50`.
- **Browser shows a certificate warning:** you are opening the site by IP instead of `https://sports.learning-dev.com`.

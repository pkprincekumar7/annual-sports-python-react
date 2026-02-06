# Windows - Docker Desktop Installation

## 1) Install Docker Desktop

Download: https://www.docker.com/products/docker-desktop/

During install, enable **WSL2** if prompted.

## 2) Verify Installation

```powershell
docker --version
docker compose version
```

If `docker compose` fails, open Docker Desktop and make sure it is running.

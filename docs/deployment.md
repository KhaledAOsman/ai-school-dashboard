# Deployment (Ubuntu 24.04 LTS)

This guide assumes a fresh or existing Ubuntu 24.04 VPS. **Before making
any change to a shared/production VPS, inspect what is already running**
(other Docker containers, existing Nginx configs, existing services) and
back up any file you are about to modify. Never assume the VPS is empty.

## 1. Inspect the current state

```bash
docker ps -a                       # existing containers - do not touch unrelated ones
sudo nginx -t 2>/dev/null && echo "nginx already installed"
ls /etc/nginx/sites-enabled/       # existing site configs
sudo ss -tlnp                      # ports already in use
```

If Nginx is already installed and serving other sites on the same VPS,
do **not** replace the system Nginx config wholesale — either run this
project's Nginx inside Docker on non-conflicting host ports and have the
system Nginx reverse-proxy to it, or integrate this project's server
block into the existing Nginx configuration as an additional
`server { ... }` block. The `nginx/nginx.conf` in this repo assumes it
owns ports 80/443 directly; adjust if that is not the case on your VPS.

## 2. Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version   # confirm the Compose plugin is available
```

## 3. Get the project onto the server

```bash
git clone <your-repo-url> dashboard
cd dashboard
```

## 4. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `.env` and `backend/.env`:

- `POSTGRES_PASSWORD` — strong, unique, never reused
- `JWT_SECRET_KEY` — generate with:
  `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `DATABASE_URL` — must match `POSTGRES_USER` / `POSTGRES_PASSWORD` /
  `POSTGRES_DB` from `.env`
- `CORS_ORIGINS` — your real domain(s), e.g.
  `https://dashboard.rawadaltarh.com`

Never commit any of these three `.env` files.

## 5. Provision HTTPS certificates (first time only)

The `nginx.conf` in this repo expects certificates at
`/etc/letsencrypt/live/dashboard.rawadaltarh.com/`, mounted into the
`nginx` container as a volume (already configured in
`docker-compose.yml`). Obtain the initial certificate with the Nginx
container temporarily serving the HTTP-01 challenge, or use standalone
mode:

```bash
sudo docker run --rm -p 80:80 \
  -v dashboard_certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d dashboard.rawadaltarh.com \
  --agree-tos -m you@example.com --no-eff-email
```

Adjust the volume name to match what `docker compose config` reports for
this project (Compose prefixes volume names with the project/folder
name). After the certificate exists, the `certbot` service in
`docker-compose.yml` handles renewal automatically.

## 6. Build and start

```bash
docker compose up -d --build
docker compose ps        # confirm all services are healthy
```

## 7. Run migrations and seed initial data

```bash
docker compose exec backend alembic upgrade head

# Set these two env vars for this one command only - do not leave them
# set in backend/.env longer than needed.
docker compose exec -e SEED_ADMIN_EMAIL=owner@yourschool.com \
                     -e SEED_ADMIN_PASSWORD='ChangeMeImmediately!123' \
                     backend python -m scripts.seed_initial_data
```

Log in with these credentials once, then immediately change the password
and set up MFA (mandatory for the Owner role).

## 8. Verify deployment (do not skip)

```bash
curl -f http://localhost/health          # backend liveness
curl -f https://dashboard.rawadaltarh.com/health
docker compose logs backend --tail 50
docker compose logs frontend --tail 50
docker compose logs nginx --tail 50
```

Manually verify, per the specification's completion criteria:

- [ ] Frontend loads at your domain over HTTPS
- [ ] Login works
- [ ] MFA setup and verification work
- [ ] RBAC: a limited-permission user cannot see/do things they shouldn't
- [ ] Creating, submitting, approving, and rejecting an expense works
- [ ] Version history and restore work, and restoring does not delete history
- [ ] Attachment upload and download work, and download requires auth
- [ ] Audit log and security log show recent activity
- [ ] `docker compose ps` shows every container's healthcheck as `healthy`

**Do not report the deployment as complete until every item above has
actually been checked** — if something fails, report the exact error
(container logs, HTTP status, etc.) rather than assuming success.

## 9. What's exposed vs. private

| Service | Exposed to internet? | Notes |
|---|---|---|
| `nginx` | Yes — ports 80, 443 | Only entry point |
| `frontend` | No | Reached only via nginx, over the internal Docker network |
| `backend` | No | Reached only via nginx, over the internal Docker network |
| `postgres` | No | No port mapping at all — reachable only from `backend` |

## Rollback

```bash
# Roll back the last migration
docker compose exec backend alembic downgrade -1

# Roll back to a specific previous image/commit
git checkout <previous-commit>
docker compose up -d --build
```

Database data lives in the `postgres_data` Docker volume and is not
affected by rolling back application code — only by migration
downgrades, which you control explicitly.

## Updating the deployment

```bash
git pull
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

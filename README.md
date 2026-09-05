# AI School Management Platform

Internal management platform for AI School. Ships with a Finance module
(expenses, categories, approvals, attachments, reports) built on an
extensible core (auth, RBAC, audit, security, dashboards, notifications)
designed to support future modules (Marketing, Customer Support, HR,
Sales, Operations) without rewriting the core.

- **Frontend**: React + Vite + TypeScript + Tailwind, Arabic (RTL) by default
- **Backend**: Python + FastAPI, async SQLAlchemy + Alembic
- **Database**: PostgreSQL
- **Deployment**: Docker Compose + Nginx, HTTPS via Let's Encrypt

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system architecture, module layout, adding a new module/widget/permission/role
- [`docs/database.md`](docs/database.md) — schema overview, key tables, migrations
- [`docs/security-model.md`](docs/security-model.md) — auth, RBAC, MFA, audit vs security logs, file storage
- [`docs/deployment.md`](docs/deployment.md) — Ubuntu 24.04 deployment, Docker, Nginx, HTTPS, smoke tests
- [`docs/local-development.md`](docs/local-development.md) — running the stack locally without Docker

## Quick start (Docker)

```bash
git clone <this-repo>
cd dashboard
cp .env.example .env               # fill in POSTGRES_* values
cp backend/.env.example backend/.env   # fill in JWT_SECRET_KEY, DATABASE_URL, etc.
cp frontend/.env.example frontend/.env

docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed_initial_data   # requires SEED_ADMIN_EMAIL/PASSWORD env vars set
```

Visit `http://localhost` (or your configured domain once Nginx/HTTPS is set up — see `docs/deployment.md`).

## Project layout

```
backend/    FastAPI application (see docs/architecture.md)
frontend/   React + Vite application
nginx/      Public reverse-proxy configuration
docs/       All documentation referenced above
```

## Status

Finance module (expenses, categories, approvals, attachments, reports) is
implemented per the initial specification. Revenue, multi-currency,
multi-entity, and other departmental modules (Marketing, Support, HR,
Sales, Operations) are intentionally NOT implemented yet — the
architecture supports adding them without restructuring existing code
(see `docs/architecture.md`).

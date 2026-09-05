# Local Development (without Docker)

Useful for fast iteration on backend or frontend code without rebuilding
containers each time. Requires PostgreSQL running somewhere reachable
(a local install, or just run `docker compose up -d postgres` from the
repo root and point at `localhost`).

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-test.txt

cp .env.example .env
# Edit .env: set DATABASE_URL to point at your local/dev Postgres,
# and JWT_SECRET_KEY to any 32+ character random string for dev.

alembic upgrade head
SEED_ADMIN_EMAIL=dev@example.com SEED_ADMIN_PASSWORD='DevPassword!123' \
    python -m scripts.seed_initial_data

uvicorn app.main:app --reload --port 8000
```

API docs (dev only — disabled when `ENVIRONMENT=production`):
`http://localhost:8000/api/docs`

### Running tests

```bash
cd backend
pytest -v
pytest --cov=app --cov-report=term-missing   # with coverage
```

Tests run against an in-memory SQLite database (see `tests/conftest.py`)
— no separate test database needs to be configured.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_BASE_URL defaults to /api - if the backend runs on a
# different host/port than the Vite dev server proxy expects, set it
# explicitly, e.g. http://localhost:8000/api
npm run dev
```

Visit `http://localhost:5173`. The Vite dev server does not proxy `/api`
to the backend by default in this config — either run the backend behind
something that serves both at the same origin during development, or set
`VITE_API_BASE_URL` to the backend's full URL (e.g.
`http://localhost:8000/api`) and ensure `CORS_ORIGINS` in
`backend/.env` includes `http://localhost:5173`.

## Code style

- Backend: type hints throughout, Pydantic schemas for all request/response
  shapes, service/repository separation (business logic never in route
  handlers, raw queries never in services).
- Frontend: TypeScript strict mode, functional components, Tailwind for
  styling, React Query for all server state (no manual `useEffect` data
  fetching).

#!/bin/sh
# Entrypoint: runs DB migrations (and, once, the initial seed) automatically
# on every container start before launching the API server. Both steps are
# idempotent - alembic tracks applied revisions, and seed_initial_data.py
# skips anything that already exists - so this is safe to run on every
# restart, not just the first one. This lets a fresh deploy (e.g. via the
# Hostinger Docker Compose API, which has no interactive shell access)
# bootstrap the database without a separate manual step.
set -e

echo "Running database migrations..."
alembic upgrade head

if [ -n "$SEED_ADMIN_EMAIL" ] && [ -n "$SEED_ADMIN_PASSWORD" ]; then
    echo "Running initial data seed (idempotent - skips existing records)..."
    python -m scripts.seed_initial_data || echo "Seed step finished (non-fatal if already seeded)."
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers

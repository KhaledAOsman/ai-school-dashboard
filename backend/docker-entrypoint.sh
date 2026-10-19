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

# Workers: the app is stateless (sessions are JWT + DB, cache / rate-limit
# counters live in Redis, uploads on the shared volume), so several worker
# processes - or several containers - can serve requests side by side.
# --forwarded-allow-ips='*' is safe ONLY because the port is never
# published: nginx (which overwrites X-Forwarded-For) is the sole client.
WORKERS="${UVICORN_WORKERS:-2}"
echo "Starting API server with $WORKERS worker(s)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    --workers "$WORKERS" \
    --proxy-headers --forwarded-allow-ips='*' \
    --timeout-keep-alive 30 \
    --no-server-header

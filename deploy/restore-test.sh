#!/usr/bin/env bash
# Proves the latest backup can actually be restored - run it monthly (cron)
# and after every change to the backup script. Restores into a throw-away
# Postgres container (never touches the live database), checks the key
# tables, and prints how long it took: that number is the database part of
# the RTO (recovery time objective).
#
#   sudo /docker/ai-school-dashboard/deploy/restore-test.sh [db-<stamp>.dump.enc]
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ai-school}"
KEY_FILE="${BACKUP_KEY_FILE:-/root/.ai-school-backup.key}"
FILE="${1:-$(ls -1t "$BACKUP_DIR"/db-*.dump.enc | head -1)}"
case "$FILE" in /*) ;; *) FILE="$BACKUP_DIR/$FILE";; esac
NAME="restore-test-$$"
START=$(date +%s)

stamp="$(basename "$FILE" | sed -e 's/^db-//' -e 's/\.dump\.enc$//')"
if [ -f "$BACKUP_DIR/$stamp.sha256" ]; then
  ( cd "$BACKUP_DIR" && grep "db-$stamp" "$stamp.sha256" | sha256sum -c - )
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restore-test] $FILE"
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restoretest postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$NAME" psql -U postgres -qc "CREATE DATABASE restored"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$FILE" \
  | docker exec -i "$NAME" pg_restore -U postgres -d restored --no-owner --exit-on-error

echo "[restore-test] row counts:"
docker exec "$NAME" psql -U postgres -d restored -At -F ' | ' -c "
  SELECT 'alembic version', version_num FROM alembic_version
  UNION ALL SELECT 'users', count(*)::text FROM users
  UNION ALL SELECT 'crm_leads', count(*)::text FROM crm_leads
  UNION ALL SELECT 'crm_bookings', count(*)::text FROM crm_bookings
  UNION ALL SELECT 'subscriptions', count(*)::text FROM subscriptions
  UNION ALL SELECT 'expenses', count(*)::text FROM expenses
  UNION ALL SELECT 'expenses total', coalesce(sum(amount),0)::text FROM expenses WHERE status <> 'cancelled'
  UNION ALL SELECT 'finance_revenues', count(*)::text FROM finance_revenues"

echo "[restore-test] OK - restored in $(( $(date +%s) - START )) s"

#!/usr/bin/env bash
# REAL restore of the live database (and optionally attachments) from an
# encrypted backup. Destroys the current data - a safety backup is taken
# first. Usage:
#   sudo deploy/restore.sh db-<stamp>.dump.enc [attachments-<stamp>.tar.gz.enc]
set -euo pipefail

APP_DIR="${APP_DIR:-/docker/ai-school-dashboard}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ai-school}"
KEY_FILE="${BACKUP_KEY_FILE:-/root/.ai-school-backup.key}"
DB_FILE="$BACKUP_DIR/$(basename "${1:?db backup file}")"
ATT_FILE="${2:+$BACKUP_DIR/$(basename "$2")}"

cd "$APP_DIR"
set -a; . ./.env; set +a
read -r -p "This REPLACES the live database with $(basename "$DB_FILE"). Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || exit 1

echo "[restore] safety backup of the current state first..."
"$APP_DIR/deploy/backup.sh"

dec() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$1"; }

docker compose stop backend
dec "$DB_FILE" | docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error
if [ -n "$ATT_FILE" ]; then
  dec "$ATT_FILE" | docker compose run --rm --no-deps -T --entrypoint tar backend -C /app/storage/attachments -xzf -
fi
docker compose up -d backend
echo "[restore] done - check https://dashboard.rawadaltarh.com"

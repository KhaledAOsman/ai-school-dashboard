#!/usr/bin/env bash
# Encrypted backup of the database + uploaded attachments.
#
#   sudo /docker/ai-school-dashboard/deploy/backup.sh
#
# Writes to $BACKUP_DIR (default /var/backups/ai-school):
#   db-<stamp>.dump.enc           pg_dump custom format, AES-256 encrypted
#   attachments-<stamp>.tar.gz.enc
#   <stamp>.sha256                checksums of both files
# Keeps the last $KEEP_DAYS days (default 14). If $RCLONE_REMOTE is set
# (e.g. "b2:ai-school-backups"), the files are also copied off the server -
# a backup that lives only on the VPS dies with the VPS.
#
# The encryption key is a file readable only by root (default
# /root/.ai-school-backup.key). Create it ONCE and store a copy in a
# password manager - without it the backups cannot be restored:
#   sudo sh -c 'openssl rand -base64 48 > /root/.ai-school-backup.key && chmod 600 /root/.ai-school-backup.key'
set -euo pipefail

APP_DIR="${APP_DIR:-/docker/ai-school-dashboard}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ai-school}"
KEY_FILE="${BACKUP_KEY_FILE:-/root/.ai-school-backup.key}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

cd "$APP_DIR"
[ -r "$KEY_FILE" ] || { echo "missing key file $KEY_FILE (see header)"; exit 1; }
set -a; . ./.env; set +a
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE"; }

echo "[backup] database..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner \
  | enc > "$BACKUP_DIR/db-$STAMP.dump.enc"

echo "[backup] attachments..."
docker compose run --rm --no-deps -T --entrypoint tar backend -C /app/storage/attachments -czf - . \
  | enc > "$BACKUP_DIR/attachments-$STAMP.tar.gz.enc"

( cd "$BACKUP_DIR" && sha256sum "db-$STAMP.dump.enc" "attachments-$STAMP.tar.gz.enc" > "$STAMP.sha256" )

# a dump smaller than 1 KB means pg_dump failed silently - fail loudly instead
[ "$(stat -c %s "$BACKUP_DIR/db-$STAMP.dump.enc")" -gt 1024 ] || { echo "[backup] database dump is suspiciously small"; exit 1; }

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "[backup] copying off-site to $RCLONE_REMOTE..."
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "*$STAMP*"
fi

find "$BACKUP_DIR" -type f -mtime "+$KEEP_DAYS" -delete
echo "[backup] done: $BACKUP_DIR/*$STAMP*"
ls -lh "$BACKUP_DIR" | tail -4

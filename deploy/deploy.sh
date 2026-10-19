#!/usr/bin/env bash
# Safe deploy with automatic rollback.
#
#   cd /docker/ai-school-dashboard && sudo deploy/deploy.sh
#
#   1. encrypted backup (so a bad migration can be undone with restore.sh)
#   2. git pull, build images tagged with the commit (old images stay)
#   3. restart, then wait for the backend /ready and nginx to be healthy
#   4. if they are not healthy in 3 minutes -> roll back to the previous
#      commit's images automatically (no rebuild needed)
#
# Manual rollback to the previous release at any time:
#   sudo deploy/deploy.sh --rollback
#
# Migrations are additive (new tables / columns / indexes), so the previous
# release keeps working on the newer schema; for anything else restore the
# backup taken in step 1.
set -euo pipefail

APP_DIR="${APP_DIR:-/docker/ai-school-dashboard}"
cd "$APP_DIR"
STATE=.deploy-state           # remembers the last good commit
PREV="$(cat "$STATE" 2>/dev/null || git rev-parse --short HEAD)"

up_version() {
  APP_VERSION="$1" docker compose up -d --remove-orphans
}

healthy() {
  for i in $(seq 1 36); do
    b=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q backend)" 2>/dev/null || echo none)
    n=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q nginx)" 2>/dev/null || echo none)
    echo "  backend=$b nginx=$n"
    [ "$b" = healthy ] && [ "$n" = healthy ] && return 0
    sleep 5
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  echo "[deploy] rolling back to $PREV"
  up_version "$PREV"
  healthy && echo "[deploy] rolled back to $PREV" || { echo "[deploy] rollback NOT healthy - check: docker compose logs --tail 100 backend"; exit 1; }
  exit 0
fi

# Make sure the release that is running right now is kept under its own tag,
# so rolling back never needs a rebuild (also covers the very first deploy,
# when the images were still built without a version tag).
for svc in backend frontend; do
  if ! docker image inspect "ai-school-$svc:$PREV" >/dev/null 2>&1; then
    cid="$(docker compose ps -q "$svc" || true)"
    [ -n "$cid" ] && docker tag "$(docker inspect -f '{{.Image}}' "$cid")" "ai-school-$svc:$PREV"
  fi
done

echo "[deploy] backup before deploy..."
"$APP_DIR/deploy/backup.sh" || { echo "[deploy] backup failed - aborting deploy"; exit 1; }

git pull --ff-only
NEW="$(git rev-parse --short HEAD)"
echo "[deploy] building $NEW (previous: $PREV)"
APP_VERSION="$NEW" docker compose build backend frontend
up_version "$NEW"

if healthy; then
  echo "$NEW" > "$STATE"
  echo "[deploy] OK - $NEW is live"
  docker image prune -f >/dev/null   # dangling layers only; tagged releases are kept
else
  echo "[deploy] $NEW is NOT healthy - rolling back to $PREV"
  docker compose logs --tail 60 backend || true
  up_version "$PREV"
  healthy && echo "[deploy] rolled back to $PREV" || echo "[deploy] rollback NOT healthy - investigate now"
  exit 1
fi

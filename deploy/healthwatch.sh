#!/usr/bin/env bash
# Lightweight monitoring for a single VPS - run every 5 minutes from cron:
#   */5 * * * * /docker/ai-school-dashboard/deploy/healthwatch.sh >> /var/log/ai-school-health.log 2>&1
# Checks CPU load, RAM, disk, container health, DB connections and the
# public site. Prints one line per run; on a problem it also POSTs the
# message to $ALERT_WEBHOOK (Slack / Discord / Telegram-bot URL) if set.
set -uo pipefail
APP_DIR="${APP_DIR:-/docker/ai-school-dashboard}"
cd "$APP_DIR" || exit 1
set -a; . ./.env; set +a
problems=()

load=$(awk '{print $1}' /proc/loadavg); cpus=$(nproc)
awk -v l="$load" -v c="$cpus" 'BEGIN{exit !(l > c*2)}' && problems+=("load $load on $cpus cpu")

mem_avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
[ "$mem_avail" -lt 300 ] && problems+=("only ${mem_avail}MB RAM available")

disk=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
[ "$disk" -gt 85 ] && problems+=("disk ${disk}% full")

for svc in postgres redis backend frontend nginx; do
  id=$(docker compose ps -q "$svc" 2>/dev/null)
  st=$( [ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)
  case "$st" in healthy|running) ;; *) problems+=("$svc is $st");; esac
done

conns=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from pg_stat_activity" 2>/dev/null || echo "?")
[ "$conns" != "?" ] && [ "$conns" -gt 45 ] && problems+=("$conns DB connections (max 60)")

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://dashboard.rawadaltarh.com/health || echo 000)
[ "$code" = 200 ] || problems+=("public /health returned $code")

line="$(date -u +%FT%TZ) load=$load mem_avail=${mem_avail}MB disk=${disk}% db_conns=$conns site=$code"
if [ ${#problems[@]} -eq 0 ]; then
  echo "$line OK"
else
  msg="AI School ALERT: ${problems[*]}"
  echo "$line PROBLEM: ${problems[*]}"
  [ -n "${ALERT_WEBHOOK:-}" ] && curl -s -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"$msg\",\"content\":\"$msg\"}" "$ALERT_WEBHOOK" >/dev/null
fi

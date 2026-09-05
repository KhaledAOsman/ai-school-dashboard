# Full clean rebuild script for local testing.
# Run this from the project root (C:\Users\start\Documents\GitHub\dashboard):
#   .\rebuild-local.ps1
#
# This guarantees Docker is NOT using any cached/stale image layers by:
#   1. Stopping everything and removing containers + volumes
#   2. Removing the backend/frontend images explicitly
#   3. Rebuilding with --no-cache
#   4. Running migrations
#   5. Seeding the initial Owner/Admin user

$ErrorActionPreference = "Stop"

Write-Host "=== Stopping and removing all containers + volumes ===" -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.local.yml down -v

Write-Host "=== Removing old backend/frontend images (ignore errors if they don't exist) ===" -ForegroundColor Cyan
docker rmi dashboard-backend -f 2>$null
docker rmi dashboard-frontend -f 2>$null

Write-Host "=== Rebuilding everything with --no-cache (this will take a few minutes) ===" -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.local.yml build --no-cache

Write-Host "=== Starting all services ===" -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

Write-Host "=== Waiting 15 seconds for postgres/backend to become healthy ===" -ForegroundColor Cyan
Start-Sleep -Seconds 15

Write-Host "=== Current container status ===" -ForegroundColor Cyan
docker compose ps

Write-Host "=== Running database migrations ===" -ForegroundColor Cyan
docker compose exec backend alembic upgrade head

Write-Host "=== Seeding initial Owner/Admin user (owner@test.com / TestPass!12345) ===" -ForegroundColor Cyan
docker compose exec -e SEED_ADMIN_EMAIL=owner@test.com -e SEED_ADMIN_PASSWORD="TestPass!12345" backend python -m scripts.seed_initial_data

Write-Host "=== Health check ===" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost/health" -Method Get
    Write-Host "Health: $($health | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
}

try {
    $ready = Invoke-RestMethod -Uri "http://localhost/ready" -Method Get
    Write-Host "Ready: $($ready | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Ready check failed: $_" -ForegroundColor Red
}

Write-Host "=== Done. Try logging in at http://localhost with owner@test.com / TestPass!12345 ===" -ForegroundColor Cyan
Write-Host "=== If anything failed above, run: docker compose logs backend --tail 100 ===" -ForegroundColor Yellow

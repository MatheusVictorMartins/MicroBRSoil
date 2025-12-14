# MicroBRSoil Docker Rebuild Script
# Simple script to rebuild with fixed R package dependencies

Write-Host "🛠️ MicroBRSoil Docker Rebuild Script" -ForegroundColor Blue
Write-Host "====================================" -ForegroundColor Blue

Write-Host ""
Write-Host "🔵 Stopping existing containers..." -ForegroundColor Blue
docker-compose down

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Failed to stop containers (they may not have been running)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔵 Building worker container with dependency fixes..." -ForegroundColor Blue
docker-compose build --no-cache worker

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build worker container" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Worker container built successfully" -ForegroundColor Green

Write-Host ""
Write-Host "🔵 Starting containers..." -ForegroundColor Blue
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ All containers started successfully" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Your MicroBRSoil application is now running:" -ForegroundColor Green
Write-Host "   • Frontend: http://localhost:8080"
Write-Host "   • Backend API: http://localhost:3000"
Write-Host ""
Write-Host "📋 Monitor R package installation progress:" -ForegroundColor Yellow
Write-Host "   docker-compose logs -f worker"
Write-Host ""
Write-Host "🔍 Test R packages once startup is complete:" -ForegroundColor Yellow
Write-Host "   docker-compose exec worker Rscript -e `"library(dada2); cat('✅ dada2 is working\n')`""
Write-Host ""

Read-Host "Press Enter to continue"

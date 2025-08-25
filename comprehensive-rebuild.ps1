# Comprehensive Docker rebuild with fallback options

Write-Host "🔧 MicroBRSoil Docker Fix & Rebuild" -ForegroundColor Blue
Write-Host "====================================" -ForegroundColor Blue

Write-Host ""
Write-Host "🎯 Choose approach:" -ForegroundColor Yellow
Write-Host "1. Fixed Dockerfile (with curl installed first)" -ForegroundColor White
Write-Host "2. Binary Node.js installation (more reliable)" -ForegroundColor White
Write-Host "3. Check what went wrong with current build" -ForegroundColor White

$choice = Read-Host "Select option (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🔨 Using fixed Dockerfile (standard approach)..." -ForegroundColor Blue
        $dockerFile = "Dockerfile.worker"
    }
    "2" {
        Write-Host ""
        Write-Host "🔨 Using binary Node.js installation..." -ForegroundColor Blue
        $dockerFile = "Dockerfile.worker.binary"
        
        # Update docker-compose to use the binary dockerfile
        Write-Host "📝 Updating docker-compose to use binary Dockerfile..." -ForegroundColor Blue
        $env:WORKER_DOCKERFILE = "Dockerfile.worker.binary"
    }
    "3" {
        Write-Host ""
        Write-Host "🔍 Checking current Docker setup..." -ForegroundColor Blue
        Write-Host "Docker version:" -ForegroundColor Yellow
        docker --version
        Write-Host ""
        Write-Host "Docker info:" -ForegroundColor Yellow
        docker info | Select-String "Server Version", "Operating System", "Architecture"
        Write-Host ""
        Write-Host "Available space:" -ForegroundColor Yellow
        docker system df
        Write-Host ""
        Read-Host "Press Enter to continue"
        return
    }
    default {
        Write-Host "❌ Invalid choice" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🛑 Stopping containers..." -ForegroundColor Blue
docker-compose down

Write-Host ""
Write-Host "🗑️ Cleaning up previous build..." -ForegroundColor Blue
docker system prune -f

Write-Host ""
Write-Host "🔨 Building worker container..." -ForegroundColor Blue
$startTime = Get-Date

if ($dockerFile -eq "Dockerfile.worker.binary") {
    # Build with the binary dockerfile
    docker build -f "./backend/Dockerfile.worker.binary" -t microbrsoil-worker ./backend
    if ($LASTEXITCODE -eq 0) {
        # Tag it properly for docker-compose
        docker tag microbrsoil-worker microbrsoil_worker
    }
} else {
    docker-compose build --no-cache worker
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Common issues and solutions:" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔍 Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check internet connection:" -ForegroundColor White
    Write-Host "   ping 8.8.8.8" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Check Docker Desktop status:" -ForegroundColor White
    Write-Host "   Docker Desktop should be running" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Try with Docker restart:" -ForegroundColor White
    Write-Host "   Restart Docker Desktop and try again" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Check available disk space:" -ForegroundColor White
    Write-Host "   docker system df" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$buildTime = (Get-Date) - $startTime
Write-Host "✅ Build completed in $($buildTime.TotalMinutes.ToString('F1')) minutes" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Starting containers..." -ForegroundColor Blue
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "✅ Success! Monitor R package installation:" -ForegroundColor Green
Write-Host "   docker-compose logs -f worker" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Test after 2-3 minutes:" -ForegroundColor Cyan
Write-Host "   docker-compose exec worker Rscript -e `"library(dada2); cat('✅ Core packages ready!\n')`"" -ForegroundColor White

Read-Host "`nPress Enter to continue"

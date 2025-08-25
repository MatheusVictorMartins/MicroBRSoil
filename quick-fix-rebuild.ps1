# Quick fix for the curl issue in Dockerfile

Write-Host "🔧 Fixing Dockerfile and rebuilding..." -ForegroundColor Blue
Write-Host "=====================================" -ForegroundColor Blue

Write-Host ""
Write-Host "✅ Fixed Dockerfile.worker (added curl installation)" -ForegroundColor Green
Write-Host ""

Write-Host "🛑 Stopping containers..." -ForegroundColor Blue
docker-compose down

Write-Host ""
Write-Host "🔨 Building worker container with fixed Dockerfile..." -ForegroundColor Blue
$startTime = Get-Date
docker-compose build --no-cache worker

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed again. Let's check the error..." -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Possible solutions:" -ForegroundColor Yellow
    Write-Host "1. Check Docker Desktop is running" -ForegroundColor White
    Write-Host "2. Check internet connection for package downloads" -ForegroundColor White
    Write-Host "3. Try a simpler Node.js installation approach" -ForegroundColor White
    Read-Host "Press Enter to exit"
    exit 1
}

$buildTime = (Get-Date) - $startTime
Write-Host "✅ Worker container built successfully in $($buildTime.TotalMinutes.ToString('F1')) minutes" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Starting containers..." -ForegroundColor Blue
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "✅ All systems go! Monitor R package installation:" -ForegroundColor Green
Write-Host "   docker-compose logs -f worker" -ForegroundColor White

Read-Host "`nPress Enter to continue"

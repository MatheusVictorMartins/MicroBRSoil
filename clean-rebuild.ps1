# Clean rebuild script for MicroBRSoil with R dependency fixes
# This script ensures a completely fresh build

Write-Host "🛠️ MicroBRSoil Clean Rebuild (R Dependency Fix)" -ForegroundColor Blue
Write-Host "===================================================" -ForegroundColor Blue

Write-Host ""
Write-Host "🔄 This will perform a complete clean rebuild to fix R dependency issues" -ForegroundColor Yellow
Write-Host "⏱️ Expected time: 5-8 minutes for first build" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelled by user" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🛑 Stopping and removing all containers..." -ForegroundColor Blue
docker-compose down

Write-Host ""  
Write-Host "🗑️ Removing R packages volume to force fresh install..." -ForegroundColor Blue
docker volume rm microbrsoil_r-packages 2>$null

Write-Host ""
Write-Host "🧹 Cleaning Docker build cache..." -ForegroundColor Blue  
docker system prune -f

Write-Host ""
Write-Host "🔨 Building worker container with Rocker R 4.3.2 base..." -ForegroundColor Blue
docker-compose build --no-cache worker

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build worker container" -ForegroundColor Red
    Write-Host "Check the output above for errors" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Worker container built successfully" -ForegroundColor Green

Write-Host ""
Write-Host "🔨 Building other containers..." -ForegroundColor Blue
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build other containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"  
    exit 1
}

Write-Host ""
Write-Host "🚀 Starting all containers..." -ForegroundColor Blue
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "✅ All containers started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Your MicroBRSoil application is now running:" -ForegroundColor Green
Write-Host "   • Frontend: http://localhost:8080" -ForegroundColor White
Write-Host "   • Backend API: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "📋 Monitor R package installation (first startup only):" -ForegroundColor Yellow
Write-Host "   docker-compose logs -f worker" -ForegroundColor White
Write-Host ""
Write-Host "🔍 After startup completes, test R packages with:" -ForegroundColor Yellow  
Write-Host "   docker-compose exec worker Rscript -e `"library(dada2); cat('✅ dada2 is working!\n')`"" -ForegroundColor White
Write-Host ""
Write-Host "⏱️ First startup will take 3-5 minutes to install R packages" -ForegroundColor Cyan
Write-Host "⚡ Subsequent startups will be fast (~30 seconds)" -ForegroundColor Cyan

Read-Host "`nPress Enter to continue"

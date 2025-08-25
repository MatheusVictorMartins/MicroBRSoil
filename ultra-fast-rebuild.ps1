# Ultra-Fast R Package Installation for MicroBRSoil
# This approach minimizes installation time by installing only core packages initially

Write-Host "🚀 MicroBRSoil Ultra-Fast R Package Setup" -ForegroundColor Blue
Write-Host "===========================================" -ForegroundColor Blue

Write-Host ""
Write-Host "🎯 New Optimized Approach:" -ForegroundColor Yellow
Write-Host "  • Core packages (dada2, ggplot2) installed at startup: ~2-3 minutes" -ForegroundColor White
Write-Host "  • Additional packages installed on-demand per pipeline: ~30-60 seconds" -ForegroundColor White
Write-Host "  • Total time reduced from 40+ minutes to under 5 minutes!" -ForegroundColor Green

Write-Host ""
$confirm = Read-Host "Proceed with optimized rebuild? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelled by user" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🛑 Stopping containers..." -ForegroundColor Blue
docker-compose down

Write-Host ""
Write-Host "🗑️ Removing old R packages volume..." -ForegroundColor Blue
docker volume rm microbrsoil_r-packages 2>$null

Write-Host ""
Write-Host "🔨 Building optimized worker container..." -ForegroundColor Blue
$startTime = Get-Date
docker-compose build --no-cache worker

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build worker container" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$buildTime = (Get-Date) - $startTime
Write-Host "✅ Worker container built in $($buildTime.TotalMinutes.ToString('F1')) minutes" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Starting containers..." -ForegroundColor Blue
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start containers" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "✅ Containers started!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Your MicroBRSoil application is running:" -ForegroundColor Green
Write-Host "   • Frontend: http://localhost:8080" -ForegroundColor White
Write-Host "   • Backend API: http://localhost:3000" -ForegroundColor White

Write-Host ""
Write-Host "📋 What happens now:" -ForegroundColor Yellow
Write-Host "   1. Core R packages (dada2, ggplot2) install automatically (~2-3 min)" -ForegroundColor White
Write-Host "   2. Additional packages install only when pipelines need them" -ForegroundColor White
Write-Host "   3. All packages are cached for future runs" -ForegroundColor White

Write-Host ""
Write-Host "🔍 Monitor installation progress:" -ForegroundColor Cyan
Write-Host "   docker-compose logs -f worker" -ForegroundColor White

Write-Host ""
Write-Host "🧪 Test core packages (after 2-3 minutes):" -ForegroundColor Cyan
Write-Host "   docker-compose exec worker Rscript -e `"library(dada2); library(ggplot2); cat('✅ Core packages working!\n')`"" -ForegroundColor White

Write-Host ""
Read-Host "Press Enter to continue"

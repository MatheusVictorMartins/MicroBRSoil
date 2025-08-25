# Test R packages in the worker container

Write-Host "🧪 Testing R Packages in MicroBRSoil Worker" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue

Write-Host ""
Write-Host "🔍 Checking if worker container is running..." -ForegroundColor Blue

$workerStatus = docker-compose ps worker --format json | ConvertFrom-Json
if (-not $workerStatus -or $workerStatus.State -ne "running") {
    Write-Host "❌ Worker container is not running" -ForegroundColor Red
    Write-Host "Run docker-compose up -d first" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Worker container is running" -ForegroundColor Green

Write-Host ""
Write-Host "🔍 Checking R version..." -ForegroundColor Blue
docker-compose exec worker Rscript -e "cat('R version:', R.version.string, '\n')"

Write-Host ""
Write-Host "🔍 Testing dada2 package..." -ForegroundColor Blue
$dada2Test = docker-compose exec worker Rscript -e "tryCatch({library(dada2); cat('✅ dada2: OK\n')}, error=function(e) cat('❌ dada2: FAILED -', e`$message, '\n'))" 2>&1

Write-Host ""
Write-Host "🔍 Testing phyloseq package..." -ForegroundColor Blue  
$phyloseqTest = docker-compose exec worker Rscript -e "tryCatch({library(phyloseq); cat('✅ phyloseq: OK\n')}, error=function(e) cat('❌ phyloseq: FAILED -', e`$message, '\n'))" 2>&1

Write-Host ""
Write-Host "🔍 Testing ggplot2 package..." -ForegroundColor Blue
$ggplot2Test = docker-compose exec worker Rscript -e "tryCatch({library(ggplot2); cat('✅ ggplot2: OK\n')}, error=function(e) cat('❌ ggplot2: FAILED -', e`$message, '\n'))" 2>&1

Write-Host ""
Write-Host "🔍 Testing vegan package..." -ForegroundColor Blue
$veganTest = docker-compose exec worker Rscript -e "tryCatch({library(vegan); cat('✅ vegan: OK\n')}, error=function(e) cat('❌ vegan: FAILED -', e`$message, '\n'))" 2>&1

Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Yellow
Write-Host "----------" -ForegroundColor Yellow
Write-Host $dada2Test
Write-Host $phyloseqTest  
Write-Host $ggplot2Test
Write-Host $veganTest

Write-Host ""
if ($dada2Test -match "✅" -and $phyloseqTest -match "✅" -and $ggplot2Test -match "✅") {
    Write-Host "🎉 SUCCESS: All critical R packages are working!" -ForegroundColor Green
    Write-Host "Your MicroBRSoil pipeline should now work correctly." -ForegroundColor Green
} else {
    Write-Host "⚠️ Some packages failed to load." -ForegroundColor Yellow
    Write-Host "Check the worker logs for installation progress:" -ForegroundColor Yellow
    Write-Host "   docker-compose logs worker" -ForegroundColor White
}

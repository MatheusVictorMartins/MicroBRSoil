@echo off
echo 🛠️ MicroBRSoil Docker Rebuild Script
echo ====================================

echo.
echo 📋 Choose rebuild option:
echo 1. Standard rebuild (Node + newer R)
echo 2. Rocker-based rebuild (R-first approach - more reliable)  
echo 3. Force clean rebuild (removes R packages volume)

choice /c 123 /m "Select option"

if %ERRORLEVEL%==1 goto standard
if %ERRORLEVEL%==2 goto rocker
if %ERRORLEVEL%==3 goto clean

:standard
echo.
echo 🔵 Using standard Dockerfile (Node base + newer R)...
set WORKER_DOCKERFILE=Dockerfile.worker
goto build

:rocker
echo.
echo 🔵 Using Rocker-based Dockerfile (R base + Node)...
set WORKER_DOCKERFILE=Dockerfile.worker.rocker
goto build

:clean
echo.
echo 🔵 Performing clean rebuild (removing R packages volume)...
docker-compose down -v
docker volume rm microbrsoil_r-packages 2>nul
set WORKER_DOCKERFILE=Dockerfile.worker
goto build

:build
echo.
echo 🔵 Stopping existing containers...
docker-compose down

echo.
echo 🔵 Building worker container...
docker-compose build --no-cache worker

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to build worker container
    pause
    exit /b 1
)

echo ✅ Worker container built successfully

echo.
echo 🔵 Starting containers...
docker-compose up -d

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to start containers
    pause
    exit /b 1
)

echo ✅ All containers started successfully
echo.
echo 🎯 Your MicroBRSoil application is now running:
echo    • Frontend: http://localhost:8080
echo    • Backend API: http://localhost:3000
echo.
echo 📋 Monitor R package installation progress:
echo    docker-compose logs -f worker
echo.
echo 🔍 Test R packages once startup is complete:
echo    docker-compose exec worker Rscript -e "library(dada2); cat('✅ dada2 is working\n')"
echo.

pause

@echo off
echo 🛠️ MicroBRSoil Docker Rebuild Script
echo ====================================

echo.
echo � Choose rebuild option:
echo 1. Standard rebuild (Node + newer R)
echo 2. Rocker-based rebuild (R-first approach - more reliable)
echo 3. Force clean rebuild (removes volumes)

choice /c 123 /m "Select option"

if %ERRORLEVEL%==1 goto standard
if %ERRORLEVEL%==2 goto rocker
if %ERRORLEVEL%==3 goto clean

:standard
echo.
echo 🔵 Using standard Dockerfile (Node base + newer R)...
set DOCKERFILE=Dockerfile.worker
goto build

:rocker
echo.
echo 🔵 Using Rocker-based Dockerfile (R base + Node)...
set DOCKERFILE=Dockerfile.worker.rocker
goto build

:clean
echo.
echo 🔵 Performing clean rebuild (removing volumes)...
docker-compose down -v
docker volume prune -f
set DOCKERFILE=Dockerfile.worker
goto build

:build
echo.
echo 🔵 Stopping existing containers...
docker-compose down

echo.
echo 🔵 Building worker container with %DOCKERFILE%...
docker-compose build --no-cache --build-arg DOCKERFILE=%DOCKERFILE% worker

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to build worker container
    exit /b 1
)

echo ✅ Worker container built successfully

echo.
echo 🔵 Building other containers...
docker-compose build

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to build some containers
    exit /b 1
)

echo ✅ All containers built successfully

echo.
echo 🔵 Starting containers...
docker-compose up -d

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to start containers
    exit /b 1
)

echo ✅ All containers started successfully
echo.
echo 🎯 Your MicroBRSoil application is now running:
echo    • Frontend: http://localhost:8080
echo    • Backend API: http://localhost:3000
echo.
echo 📋 Monitor startup progress:
echo    docker-compose logs -f worker
echo.
echo 🔍 Test R packages once startup is complete:
echo    docker-compose exec worker Rscript -e "library(dada2); cat('✅ dada2 is working\n')"

pause

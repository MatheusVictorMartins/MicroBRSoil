#!/bin/bash

# Quick Docker rebuild script for MicroBRSoil
# This script helps you rebuild the containers efficiently

echo "🛠️ MicroBRSoil Docker Rebuild Script"
echo "===================================="

# Function to print colored output
print_step() {
    echo -e "\n🔵 $1"
}

print_success() {
    echo -e "✅ $1"
}

print_error() {
    echo -e "❌ $1"
}

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed or not in PATH"
    exit 1
fi

print_step "Stopping existing containers..."
docker-compose down

print_step "Building worker container (this is the one with R packages)..."
docker-compose build --no-cache worker

if [ $? -eq 0 ]; then
    print_success "Worker container built successfully"
else
    print_error "Failed to build worker container"
    exit 1
fi

print_step "Building other containers..."
docker-compose build

if [ $? -eq 0 ]; then
    print_success "All containers built successfully"
else
    print_error "Failed to build some containers"
    exit 1
fi

print_step "Starting containers..."
docker-compose up -d

if [ $? -eq 0 ]; then
    print_success "All containers started successfully"
    echo ""
    echo "🎯 Your MicroBRSoil application is now running:"
    echo "   • Frontend: http://localhost:8080"
    echo "   • Backend API: http://localhost:3000"
    echo ""
    echo "📋 To check logs:"
    echo "   docker-compose logs -f worker    # Worker logs"
    echo "   docker-compose logs -f backend-api  # API logs"
    echo ""
    echo "🔍 To check if R packages are working:"
    echo "   docker-compose exec worker Rscript -e \"library(dada2); cat('✅ dada2 is working\\n')\""
else
    print_error "Failed to start containers"
    exit 1
fi

# MicroBRSoil - Guia de Inicialização

Esta página tem o objetivo de documentar o passo a passo para instalar o MicroBRSoil em um servidor ou ambiente local.

## Índice

1. [Requisitos do Sistema](#requisitos-do-sistema)
2. [Preparação do Ambiente](#preparação-do-ambiente)
3. [Configuração de Variáveis de Ambiente](#configuração-de-variáveis-de-ambiente)
4. [Build da Aplicação](#build-da-aplicação)
5. [Execução da Aplicação](#execução-da-aplicação)
6. [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
7. [Solução de Problemas](#solução-de-problemas)

## Requisitos do Sistema

### Requisitos Mínimos
- **Sistema Operacional**: Windows, macOS ou Linux
- **Docker**: Versão 20.10 ou superior
- **Docker Compose**: Versão 2.0 ou superior
- **Memória Disponível**: mínimo 4GB RAM (8GB recomendado para processamento da pipeline em R)
- **Armazenamento Disponível**: mínimo 10GB livres

### Requisitos Recomendados
- **Memória**: 8GB+ RAM
- **Armazenamento**: 20GB+ livres (para datasets e resultados de processamento)
- **CPU**: Processador multi-core (para compilação paralela de pacotes R)

## Preparação do Ambiente

### 1. Instalar Docker e Docker Compose

#### Windows
1. Baixe e instale o [Docker Desktop para Windows](https://docs.docker.com/desktop/windows/install/)
2. Garanta que o WSL2 está habilitado
3. Inicie o Docker Desktop

#### macOS
1. Baixe e instale o [Docker Desktop para macOS](https://docs.docker.com/desktop/mac/install/)
2. Inicie o Docker Desktop

#### Linux (Ubuntu/Debian)
```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose


## Environment Variables Configuration

### 1. Create Environment File

Create a `.env` file in the root directory of the project with the following configuration:

```env
# Database Configuration
POSTGRES_DB=microbrsoil
POSTGRES_USER=micro
POSTGRES_PASSWORD=micro_password
POSTGRES_PORT=5432

# Redis Configuration  
REDIS_PORT=6379

# Application Configuration
NODE_ENV=production
BACKEND_PORT=3000
FRONTEND_PORT=8080

# Security
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Worker Configuration
WORKER_DOCKERFILE=Dockerfile.worker

# Logging (Optional)
LOG_LEVEL=info
LOG_DIR=/app/logs
```

### 2. Environment Variables Explanation

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_DB` | PostgreSQL database name | microbrsoil | Yes |
| `POSTGRES_USER` | PostgreSQL username | micro | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | micro_password | Yes |
| `POSTGRES_PORT` | PostgreSQL port mapping | 5432 | No |
| `REDIS_PORT` | Redis port mapping | 6379 | No |
| `NODE_ENV` | Node.js environment | production | No |
| `BACKEND_PORT` | Backend API port | 3000 | No |
| `FRONTEND_PORT` | Frontend web server port | 8080 | No |
| `JWT_SECRET` | JWT token signing secret | (required) | Yes |
| `WORKER_DOCKERFILE` | Worker Docker file to use | Dockerfile.worker | No |

### 3. Security Considerations

⚠️ **Important Security Notes:**
- Change `JWT_SECRET` to a strong, unique value in production
- Use strong passwords for `POSTGRES_PASSWORD`
- Consider using Docker secrets for sensitive values in production

## Building the Application

### 1. Using the Automated Build Scripts

#### Windows (PowerShell)
```powershell
.\rebuild.ps1
```

#### Windows (Command Prompt)
```cmd
rebuild.cmd
```

#### Linux/macOS
```bash
chmod +x rebuild.sh
./rebuild.sh
```

### 2. Manual Build Process

#### Step 1: Stop any existing containers
```bash
docker-compose down
```

#### Step 2: Build all services
```bash
docker-compose build --no-cache
```

#### Step 3: Build specific services (if needed)
```bash
# Build backend API only
docker-compose build backend-api

# Build worker with specific Dockerfile
docker-compose build worker

# Build with optimized worker
WORKER_DOCKERFILE=Dockerfile.worker.optimized docker-compose build worker
```

### 3. Worker Build Options

The application supports multiple worker configurations:

- **Standard**: `Dockerfile.worker` (Node.js base with R)
- **Rocker-based**: `Dockerfile.worker.rocker` (R-first approach)
- **Optimized**: `Dockerfile.worker.optimized` (Build-time R package installation)

Set the `WORKER_DOCKERFILE` environment variable to choose:

```bash
# For rocker-based worker
export WORKER_DOCKERFILE=Dockerfile.worker.rocker
docker-compose build worker
```

## Running the Application

### 1. Start All Services

```bash
docker-compose up -d
```

### 2. Start Specific Services

```bash
# Start database and cache only
docker-compose up -d postgres redis

# Start all backend services
docker-compose up -d postgres redis backend-api worker

# Start everything including frontend
docker-compose up -d
```

### 3. View Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend-api
docker-compose logs -f worker
docker-compose logs -f postgres
```

### 4. Access the Application

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000
- **Database**: localhost:5432 (if POSTGRES_PORT not changed)
- **Redis**: localhost:6379 (if REDIS_PORT not changed)

## Development Setup

### 1. Local Development (without Docker)

#### Prerequisites
- Node.js 20+ 
- PostgreSQL 16+
- Redis 7+
- R 4.3.2+ with required packages

#### Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # Configure your local environment
npm run dev
```

#### Frontend Setup
The frontend is static HTML/CSS/JS served from the `src/` directory. You can serve it using any web server:

```bash
# Using Python
cd src
python -m http.server 8080

# Using Node.js http-server
npx http-server src -p 8080
```

### 2. Development with Docker

#### Hot Reload Development
```bash
# Override for development with volume mounts
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

#### Database Development
```bash
# Access database directly
docker-compose exec postgres psql -U micro -d microbrsoil

# Run database migrations/setup
docker-compose exec backend-api npm run migrate
```

## Troubleshooting

### Common Issues

#### 1. Port Conflicts
**Error**: Port already in use
**Solution**: 
- Change ports in `.env` file
- Stop conflicting services: `sudo lsof -i :3000` (Linux/macOS) or `netstat -ano | findstr :3000` (Windows)

#### 2. R Package Installation Failures
**Error**: R packages fail to install in worker
**Solution**:
- Use the optimized Dockerfile: `WORKER_DOCKERFILE=Dockerfile.worker.optimized`
- Increase Docker memory allocation to 4GB+
- Clean build: `docker-compose build --no-cache worker`

#### 3. Database Connection Issues
**Error**: Cannot connect to PostgreSQL
**Solution**:
- Verify PostgreSQL container is running: `docker-compose ps postgres`
- Check database logs: `docker-compose logs postgres`
- Verify environment variables in `.env`

#### 4. Permission Issues (Linux/macOS)
**Error**: Permission denied on volumes
**Solution**:
```bash
# Fix file permissions
sudo chown -R $USER:$USER uploads/ results/ logs/

# Or run with user mapping
docker-compose run --user $(id -u):$(id -g) backend-api
```

### Health Checks

#### Verify Services
```bash
# Check all services status
docker-compose ps

# Test database connection
docker-compose exec postgres pg_isready -U micro -d microbrsoil

# Test Redis connection  
docker-compose exec redis redis-cli ping

# Test backend API
curl http://localhost:3000/health

# Check R packages in worker
docker-compose exec worker Rscript -e "library(dada2); library(phyloseq)"
```

#### Clean Reset
```bash
# Complete reset (removes all data)
docker-compose down -v
docker system prune -a
rm -rf uploads/* results/* logs/*
```

### Log Analysis

#### Key Log Locations
- **Application logs**: `logs/` directory
- **Container logs**: `docker-compose logs [service]`
- **Database logs**: `docker-compose logs postgres`
- **Worker logs**: `docker-compose logs worker`

#### Debug Mode
```bash
# Run with debug logging
LOG_LEVEL=debug docker-compose up
```

## Architecture Overview

The MicroBRSoil application consists of:

- **Frontend**: Static HTML/CSS/JS served by Nginx
- **Backend API**: Node.js/Express application
- **Worker**: Node.js + R for bioinformatics pipeline processing
- **Database**: PostgreSQL for data storage
- **Cache**: Redis for queue management and caching
- **Reverse Proxy**: Nginx for routing and static file serving

All services communicate within a Docker network and share persistent volumes for data storage.

## Next Steps

After successful setup:

1. **Database Initialization**: Load initial data and schema
2. **User Management**: Create admin users and configure roles
3. **Data Upload**: Test CSV upload and processing functionality
4. **Pipeline Testing**: Verify R-based analysis pipelines
5. **Production Deployment**: Configure for production environment

For detailed usage instructions, see `docs/usage.md`
For API documentation, see `API_DOCUMENTATION.md` 
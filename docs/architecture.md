# MicroBRSoil Architecture

## Overview

MicroBRSoil is a comprehensive bioinformatics platform for soil microbiome analysis, built as a containerized microservices architecture with Docker. The system supports multiple sequencing technologies (Illumina, Ion Torrent, ITS) and provides specialized pipelines for DNA/RNA sequencing data analysis.

## Architecture Components

### 1. Frontend (Web UI)
- **Technology**: HTML, CSS, static JavaScript
- **Server**: Nginx (alpine)
- **Port**: 8080 (default)
- **Purpose**: Web interface for file uploads and results viewing
- **Location**: `./src/` mounted at `/usr/share/nginx/html`

### 2. Backend API
- **Technology**: Node.js with Express
- **Port**: 3000 (default)
- **Container**: `microbrsoil-backend`
- **Purpose**:
  - REST API for file uploads
  - Job/queue management
  - Authentication and authorization
  - Database interface

**Key Endpoints:**
- `POST /upload/illumina` - Upload for Illumina/16S rRNA pipeline
- `POST /upload/iontorrent` - Upload for Ion Torrent pipeline
- `POST /upload/its` - Upload for ITS (fungi) pipeline
- `/auth/*` - Authentication endpoints

### 3. Worker (Pipeline Processor)
- **Technology**: Node.js + R (rocker/r-ver:4.3.2)
- **Container**: `microbrsoil-worker`
- **Purpose**:
  - Background execution of bioinformatics pipelines
  - FASTQ data processing
  - Integration with specialized R scripts
  - Analysis result generation

**Key R Scripts:**
- `pipeline_wrapper.R` - Main pipeline wrapper
- `check_system_deps.R` - Dependency checks
- `verify_r_packages.R` - R package verification

### 4. Database
- **Technology**: PostgreSQL 16 (alpine)
- **Container**: `microbrsoil-postgres`
- **Port**: 5432
- **Purpose**:
  - Upload metadata storage
  - Job and results history
  - User data and authentication

**Configuration:**
- Persistent volume: `db-data`
- Initialization scripts: `./db/`
- Health checks configured

### 5. Queue System
- **Technology**: Redis 7 (alpine)
- **Container**: `microbrsoil-redis`
- **Port**: 6379
- **Purpose**:
  - Queue management with BullMQ
  - Session cache
  - Backend-to-worker communication

### 6. Reverse Proxy
- **Technology**: Nginx
- **Purpose**:
  - Request routing
  - Load balancing
  - Backend API proxy
  - Static file serving

## Data Flow

### 1. Upload and Processing
```
Frontend -> Nginx -> Backend API -> Redis Queue -> Worker -> R Pipeline -> Results
```

1. **Upload**: User uploads via the web UI
2. **API**: Backend validates and stores files in `./uploads/{upload-id}/`
3. **Queue**: Job is added to Redis via BullMQ
4. **Worker**: Runs the appropriate R pipeline
5. **Results**: Saved in `./results/{upload-id}/`
6. **Database**: Metadata updated in PostgreSQL

### 2. Directory Structure
```
uploads/
|-- {upload-id}/
|   |-- sample1.fastq
|   |-- sample2.fastq
|   `-- metadata.csv

results/
|-- {upload-id}/
|   |-- otu_table.csv
|   |-- taxonomy_table.csv
|   |-- alpha_diversity_metrics.csv
|   `-- pipeline_output.log
```

## Supported Pipelines

### 1. Illumina Pipeline
- **Technology**: Illumina 16S rRNA sequencing
- **Input**: FASTQ files
- **Output**: OTU tables, taxonomy, diversity metrics

### 2. Ion Torrent Pipeline
- **Technology**: Ion Torrent sequencing
- **Input**: FASTQ files
- **Parameters**: Optimized for Ion Torrent technology

### 3. ITS Pipeline
- **Technology**: Fungal community analysis (Internal Transcribed Spacer)
- **Input**: FASTQ files
- **Focus**: Fungal identification and analysis

## Network Configuration

### Network: `backnet`
- **Driver**: Bridge
- **Purpose**: Internal container communication

### Connectivity:
- Frontend (8080) <-> Backend (3000)
- Backend <-> PostgreSQL (5432)
- Backend <-> Redis (6379)
- Worker <-> PostgreSQL (5432)
- Worker <-> Redis (6379)

## Persistent Volumes

### 1. Application Data
- `./uploads` -> `/app/uploads` - Input files
- `./results` -> `/app/results` - Processed results
- `./logs` -> `/app/logs` - Application logs

### 2. System Data
- `db-data` - PostgreSQL data
- `redis-data` - Redis data
- `r-packages` - Installed R packages

### 3. Code and Configuration
- `./pipeline-r` -> `/app/pipeline-r` (read-only) - R scripts
- `./db` -> `/app/db` (read-only) - Database scripts
- `./nginx/default.conf` -> `/etc/nginx/conf.d/default.conf` - Nginx config

## Security and Authentication

### 1. Authentication
- **Method**: JWT (JSON Web Tokens)
- **Endpoints**: `/auth/*`
- **Secret**: Configurable via `JWT_SECRET`

### 2. Isolation
- **Containers**: Per-container isolation
- **Network**: Isolated internal network
- **Volumes**: Separation of sensitive data

### 3. Validation
- **Uploads**: File type validation
- **Input**: Input sanitization
- **Size Limits**: 2 GB per upload

## Monitoring and Logs

### 1. Structured Logs
- **API**: `./logs/api-*.log`
- **Database**: `./logs/database-*.log`
- **Worker**: `./logs/worker-*.log`

### 2. Health Checks
- **PostgreSQL**: `pg_isready`
- **Redis**: Service startup checks
- **API**: Dependency checks

### 3. Metrics
- **Queue**: Job status via BullMQ
- **Database**: Connections and performance
- **Storage**: Disk usage for uploads/results

## Scalability

### 1. Horizontal
- **Workers**: Multiple worker instances for parallel processing
- **API**: Load balancing via Nginx
- **Database**: Read replicas (future)

### 2. Vertical
- **Resources**: CPU/memory per container
- **Storage**: Expandable volumes
- **Cache**: Redis for performance

## Technologies and Dependencies

### Backend (Node.js)
- **Express**: Web framework
- **BullMQ**: Queue system
- **PostgreSQL**: Database driver (`pg`)
- **R Integration**: Node.js-R interface
- **Multer**: File uploads
- **JWT**: Authentication

### Pipeline (R)
- **Base**: rocker/r-ver:4.3.2
- **Bioinformatics**: Specialized microbiome analysis packages
- **System**: Linux build dependencies

### Infrastructure
- **Docker**: Containerization
- **Docker Compose**: Orchestration
- **Nginx**: Reverse proxy and web server
- **PostgreSQL**: Relational database
- **Redis**: Cache and queues

## Deployment

### 1. Development
```bash
# Configure environment variables
cp .env.example .env

# Build and start services
docker-compose up --build
```

### 2. Production
```bash
# Optimized build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Monitoring
docker-compose logs -f
```

### 3. Configuration
- **Environment**: Variables in `.env`
- **Database**: Initialization scripts in `./db/`
- **R Packages**: Automatic install via scripts

## Performance Considerations

### 1. I/O
- **Uploads**: Asynchronous processing
- **Results**: Filesystem cache
- **Database**: Pooled connections

### 2. Processing
- **Queue**: Background jobs
- **R Scripts**: Tuned for large datasets
- **Memory**: Configurable per container

### 3. Network
- **Internal**: Bridge network communication
- **External**: Rate limiting via Nginx
- **Caching**: Redis for sessions and cache

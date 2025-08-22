# MicroBRSoil API Documentation

## Pipeline Flow

The complete file flow from upload to database storage follows this sequence:

1. **File Upload** → 2. **Pipeline Queue** → 3. **Pipeline Execution** → 4. **Result Processing** → 5. **Database Storage**

## API Endpoints

### Upload Endpoints

#### POST /upload/file
Upload a FASTQ file and queue it for pipeline processing.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `file`: FASTQ file (required)
  - `pipelineType`: Pipeline type (optional, default: "default")

**Response:**
```json
{
  "success": true,
  "runId": "uuid-v4",
  "jobId": "bullmq-job-id",
  "message": "File uploaded and pipeline job queued successfully"
}
```

### Pipeline Endpoints

#### GET /pipeline/status/:runId
Get the status of a pipeline run.

**Response:**
```json
{
  "success": true,
  "run": {
    "run_id": "uuid-v4",
    "job_id": "bullmq-job-id",
    "user_id": 1,
    "status": "completed|running|queued|failed",
    "pipeline_type": "default",
    "input_file_path": "/path/to/file",
    "output_directory": "/path/to/results",
    "created_at": "2025-01-20T10:00:00Z",
    "started_at": "2025-01-20T10:00:05Z",
    "finished_at": "2025-01-20T10:05:00Z",
    "error_message": null,
    "logs": ["array", "of", "log", "messages"]
  }
}
```

#### GET /pipeline/results/:runId
Get pipeline results for a completed run.

**Response:**
```json
{
  "success": true,
  "run": { /* pipeline run object */ },
  "results": {
    "result_id": 1,
    "run_id": "uuid-v4",
    "soil_id": 123,
    "alpha_diversity_file": "/path/to/alpha_diversity_metrics.csv",
    "otu_table_file": "/path/to/otu_table.csv",
    "taxonomy_file": "/path/to/taxonomy_table.csv",
    "metadata_file": "/path/to/mock_metadata.csv",
    "processed_at": "2025-01-20T10:05:30Z"
  }
}
```

#### GET /pipeline/runs
Get all pipeline runs for the authenticated user.

**Response:**
```json
{
  "success": true,
  "runs": [
    { /* pipeline run objects */ }
  ]
}
```

### Results Endpoints

#### GET /results/files/:runId
List result files for a pipeline run.

**Response:**
```json
{
  "files": [
    {
      "name": "alpha_diversity_metrics.csv",
      "size": 1024,
      "modified": "2025-01-20T10:05:00Z",
      "downloadUrl": "/api/results/download/uuid-v4/alpha_diversity_metrics.csv"
    },
    {
      "name": "otu_table.csv",
      "size": 2048,
      "modified": "2025-01-20T10:05:00Z",
      "downloadUrl": "/api/results/download/uuid-v4/otu_table.csv"
    }
  ]
}
```

#### GET /results/download/:runId/:filename
Download a specific result file.

**Response:**
- Content-Type: text/csv
- Content-Disposition: attachment; filename="filename.csv"
- Body: CSV file content

## Database Schema

### pipeline_runs
Tracks pipeline execution runs.

| Column | Type | Description |
|--------|------|-------------|
| run_id | UUID | Primary key, unique run identifier |
| job_id | VARCHAR(255) | BullMQ job identifier |
| user_id | INTEGER | Foreign key to users table |
| status | VARCHAR(50) | queued, running, completed, failed |
| pipeline_type | VARCHAR(100) | Type of pipeline to run |
| input_file_path | TEXT | Path to input FASTQ file |
| output_directory | TEXT | Path to output directory |
| created_at | TIMESTAMP | When run was created |
| started_at | TIMESTAMP | When execution started |
| finished_at | TIMESTAMP | When execution finished |
| error_message | TEXT | Error message if failed |
| logs | TEXT[] | Array of log messages |

### pipeline_results
Stores paths to result files and links to processed data.

| Column | Type | Description |
|--------|------|-------------|
| result_id | SERIAL | Primary key |
| run_id | UUID | Foreign key to pipeline_runs |
| soil_id | INTEGER | Foreign key to soil table (if data processed) |
| alpha_diversity_file | TEXT | Path to alpha diversity results |
| otu_table_file | TEXT | Path to OTU table |
| taxonomy_file | TEXT | Path to taxonomy table |
| metadata_file | TEXT | Path to metadata file |
| processed_at | TIMESTAMP | When results were processed |

## Pipeline Process Flow

1. **Upload**: User uploads FASTQ file via `/upload/file`
2. **Queue**: File upload creates pipeline run record and adds job to BullMQ
3. **Worker**: BullMQ worker picks up job and runs R pipeline script
4. **Processing**: R script processes FASTQ file and generates result CSVs
5. **Storage**: Worker processes results and stores data in database
6. **Completion**: Pipeline status updated, results available for download

## Environment Variables

```bash
# Database
DATABASE_URL=postgres://user:password@host:port/database
POSTGRES_USER=micro
POSTGRES_PASSWORD=micro_password
POSTGRES_DB=microbrsoil
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379

# File Paths
UPLOADS_DIR=/path/to/uploads
RESULTS_DIR=/path/to/results

# Security
JWT_SECRET=your-secret-key

# Server
NODE_ENV=production
PORT=3000
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- 200: Success
- 400: Bad Request (missing parameters, invalid data)
- 401: Unauthorized (authentication required)
- 403: Forbidden (access denied)
- 404: Not Found (resource doesn't exist)
- 500: Internal Server Error

Error responses include:
```json
{
  "success": false,
  "error": "Error message description"
}
```

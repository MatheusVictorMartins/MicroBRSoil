# Upload Endpoints Documentation

This document describes the three specific upload endpoints for different R pipeline types in the MicroBRSoil application.

## Overview

The application now provides three dedicated upload endpoints, each designed for specific sequencing pipeline types:

- **Illumina Pipeline** (`/api/upload/illumina`)
- **IonTorrent Pipeline** (`/api/upload/iontorrent`) 
- **ITS Pipeline** (`/api/upload/its`)

## File Organization

### Upload Directory Structure
Files are organized in upload-specific directories:
```
uploads/
├── {upload-id-1}/
│   └── original-filename.fastq
├── {upload-id-2}/
│   └── original-filename.fastq
└── ...
```

### Results Directory Structure
After pipeline execution, results are stored in:
```
results/
├── {run-id-1}/
│   ├── output-files...
│   └── pipeline-results...
├── {run-id-2}/
└── ...
```

## API Endpoints

### 1. Illumina Pipeline Upload

**Endpoint:** `POST /api/upload/illumina`

**Description:** Uploads FASTQ files for processing with the Illumina/16S rRNA gene pipeline.

**Request:**
- **Method:** POST
- **Content-Type:** multipart/form-data
- **File Field:** `fastq`
- **Supported File Types:** .fastq, .fq, .fastq.gz

**Example Request:**
```bash
curl -X POST \
  http://localhost:3000/api/upload/illumina \
  -F "fastq=@sample.fastq"
```

**Response:**
```json
{
  "success": true,
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "1",
  "pipelineType": "illumina",
  "uploadPath": "uploads/550e8400-e29b-41d4-a716-446655440000",
  "message": "File uploaded and illumina pipeline job queued successfully"
}
```

### 2. IonTorrent Pipeline Upload

**Endpoint:** `POST /api/upload/iontorrent`

**Description:** Uploads FASTQ files for processing with the IonTorrent sequencing pipeline.

**Request:**
- **Method:** POST
- **Content-Type:** multipart/form-data
- **File Field:** `fastq`
- **Supported File Types:** .fastq, .fq, .fastq.gz

**Example Request:**
```bash
curl -X POST \
  http://localhost:3000/api/upload/iontorrent \
  -F "fastq=@sample.fastq"
```

**Response:**
```json
{
  "success": true,
  "runId": "550e8400-e29b-41d4-a716-446655440001",
  "jobId": "2",
  "pipelineType": "iontorrent",
  "uploadPath": "uploads/550e8400-e29b-41d4-a716-446655440001",
  "message": "File uploaded and iontorrent pipeline job queued successfully"
}
```

### 3. ITS Pipeline Upload

**Endpoint:** `POST /api/upload/its`

**Description:** Uploads FASTQ files for processing with the ITS (Internal Transcribed Spacer) fungal pipeline.

**Request:**
- **Method:** POST
- **Content-Type:** multipart/form-data
- **File Field:** `fastq`
- **Supported File Types:** .fastq, .fq, .fastq.gz

**Example Request:**
```bash
curl -X POST \
  http://localhost:3000/api/upload/its \
  -F "fastq=@sample.fastq"
```

**Response:**
```json
{
  "success": true,
  "runId": "550e8400-e29b-41d4-a716-446655440002",
  "jobId": "3",
  "pipelineType": "its",
  "uploadPath": "uploads/550e8400-e29b-41d4-a716-446655440002",
  "message": "File uploaded and its pipeline job queued successfully"
}
```

### 4. Legacy Upload Endpoint (Backward Compatibility)

**Endpoint:** `POST /api/upload/file`

**Description:** Legacy endpoint that supports multiple pipeline types via request body parameter.

**Request:**
- **Method:** POST
- **Content-Type:** multipart/form-data
- **File Field:** `file`
- **Optional Body Parameter:** `pipelineType` (defaults to 'illumina')

**Example Request:**
```bash
curl -X POST \
  http://localhost:3000/api/upload/file \
  -F "file=@sample.fastq" \
  -F "pipelineType=its"
```

## Pipeline Execution Flow

1. **File Upload**: File is uploaded to `uploads/{upload-id}/` directory
2. **Job Queuing**: BullMQ job is created with pipeline-specific parameters
3. **Pipeline Execution**: Worker executes the appropriate R pipeline:
   - Illumina: `/app/pipeline-r/pipeline/illumina.r`
   - IonTorrent: `/app/pipeline-r/pipeline/iontorrent.R`  
   - ITS: `/app/pipeline-r/pipeline/its.R`
4. **Results Storage**: Pipeline outputs are saved to `results/{run-id}/`
5. **Database Update**: Pipeline status and metadata are updated in the database

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200 OK**: Successful upload and job queuing
- **400 Bad Request**: No file uploaded or invalid request
- **500 Internal Server Error**: Server-side processing error

**Error Response Format:**
```json
{
  "error": "Error description",
  "details": "Detailed error message"
}
```

## Pipeline-Specific R Scripts

Each pipeline type corresponds to a specific R script:

| Pipeline Type | R Script Location | Function Called |
|---------------|------------------|-----------------|
| Illumina | `/app/pipeline-r/pipeline/illumina.r` | `run_dada2_pipeline` |
| IonTorrent | `/app/pipeline-r/pipeline/iontorrent.R` | `run_dada2_pipeline` |
| ITS | `/app/pipeline-r/pipeline/its.R` | `run_pipeline_its` |

## Monitoring and Status

- Job status can be monitored via the results endpoints
- Pipeline logs are stored in the database and accessible via the API
- Results are available once pipeline execution completes

## Frontend Integration Examples

See `frontend-upload-examples.js` for JavaScript examples of how to integrate these endpoints with frontend applications.
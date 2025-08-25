# MicroBRSoil

A comprehensive bioinformatics platform for soil microbiome analysis, supporting multiple sequencing technologies and analysis pipelines.

## Overview

MicroBRSoil provides specialized upload endpoints and processing pipelines for different sequencing technologies:

- **Illumina Pipeline** - For Illumina 16S rRNA sequencing data
- **Iontorrent Pipeline** - For Ion Torrent sequencing data with optimized parameters
- **ITS Pipeline** - For Internal Transcribed Spacer (ITS) fungal community analysis

## Quick Start

### Upload Endpoints

The application provides three main upload endpoints:

```bash
# Illumina sequencing data
POST /api/upload/illumina

# Iontorrent sequencing data  
POST /api/upload/iontorrent

# ITS fungal analysis
POST /api/upload/its
```

Each endpoint:
1. Accepts multiple FASTQ files via multipart/form-data
2. Creates a unique upload directory: `uploads/{upload-id}/`
3. Queues the appropriate R pipeline for execution
4. Stores results in: `results/{upload-id}/`

### File Organization

```
uploads/
├── {upload-id}/
│   ├── sample1.fastq
│   ├── sample2.fastq
│   └── metadata.csv
└── ...

results/
├── {upload-id}/
│   ├── otu_table.csv
│   ├── taxonomy_table.csv
│   ├── alpha_diversity_metrics.csv
│   └── pipeline_output.log
└── ...
```

### Example Usage

```javascript
// Upload files for Illumina analysis
const formData = new FormData();
formData.append('files', fastqFile1);
formData.append('files', fastqFile2);

const response = await fetch('/api/upload/illumina', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Upload ID:', result.uploadId);
console.log('Job ID:', result.jobId);
```

## Architecture

- **Backend**: Node.js with Express
- **Queue System**: BullMQ with Redis
- **Database**: PostgreSQL  
- **Pipeline Processing**: R scripts with r-integration
- **File Storage**: Local filesystem with organized directory structure

## Documentation

- [Upload Endpoints](./UPLOAD_ENDPOINTS.md) - Detailed API documentation
- [Frontend Examples](./frontend-upload-examples.js) - JavaScript usage examples
- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference

## Development

See the `backend/` directory for the main application code and the `pipeline-r/` directory for R analysis scripts.
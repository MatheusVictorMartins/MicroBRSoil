# Upload Route Implementation Summary

## What was implemented

✅ **Three specialized upload endpoints**:
1. `/upload/illumina` - For Illumina/16S rRNA pipeline
2. `/upload/its` - For ITS/Fungi pipeline 
3. `/upload/barcode` - For barcode demultiplexing pipeline

✅ **File organization**:
- Files stored in `uploads/:upload_id/` folders
- Results stored in `results/:upload_id/` folders
- Each upload gets a unique UUID

✅ **Multer configuration**:
- Dynamic storage creation for each upload
- Original filenames preserved
- Support for multiple file uploads (barcode endpoint)

✅ **BullMQ integration**:
- Jobs queued with pipeline-specific data
- Worker updated to handle new file structure
- Proper error handling and status updates

✅ **Database integration**:
- Pipeline runs stored in PostgreSQL
- Job IDs tracked for monitoring
- Status updates throughout process

## File Structure

```
uploads/
├── uuid-1/
│   └── filename.fastq
├── uuid-2/
│   ├── sequences.fastq
│   └── barcodes.fa
└── uuid-3/
    └── data.fastq

results/
├── uuid-1/
│   ├── alpha_diversity_metrics.csv
│   ├── otu_table.csv
│   └── taxonomy_table.csv
├── uuid-2/
│   └── [results...]
└── uuid-3/
    └── [results...]
```

## API Usage Examples

### Illumina Pipeline
```bash
curl -X POST http://localhost:3000/upload/illumina \
  -F "fastq=@sequences.fastq"
```

### ITS Pipeline
```bash
curl -X POST http://localhost:3000/upload/its \
  -F "fastq=@fungi_sequences.fastq"
```

### Barcode Pipeline
```bash
curl -X POST http://localhost:3000/upload/barcode \
  -F "fastq=@raw_sequences.fastq" \
  -F "barcodes=@barcodes.fa"
```

## Pipeline Worker Updates

The worker now:
- Handles multiple file inputs for barcode pipeline
- Uses uploaded barcode files when provided
- Creates proper output directories per upload ID
- Maintains compatibility with existing integrations

## Testing

Use the provided test script:
```bash
cd backend
npm install
npm run test-upload
```

## Documentation

- `API_DOCUMENTATION.md` - Updated with new endpoints
- `UPLOAD_ENDPOINTS.md` - Detailed usage guide
- `frontend-upload-examples.js` - Frontend integration examples

## Dependencies Added

- `axios` - For HTTP testing
- `form-data` - For multipart form testing

## Backwards Compatibility

The original `/upload/file` endpoint is maintained as a legacy endpoint for existing clients.

## Next Steps

1. **Install dependencies**: `npm install` in backend directory
2. **Test endpoints**: Run `npm run test-upload`
3. **Update frontend**: Use the provided examples to integrate with your UI
4. **Monitor results**: Use `/pipeline/status/:uploadId` and `/results/files/:uploadId` endpoints

## R Pipeline Integration

Each endpoint executes the appropriate R script:
- **Illumina**: `16silumina.r`
- **ITS**: `dada2_pipeline_ITS.R` 
- **Barcode**: `dada2_pipeline_Daniel_edits.R`

Results are automatically processed and stored in the database using the existing result processor.

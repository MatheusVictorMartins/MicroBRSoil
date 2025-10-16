# Database Saving Process for R Pipeline Results

## Overview
This document describes the implementation of database saving process after R pipeline completion. The system only saves data when pipelines complete with "no errors" status.

## Pipeline Types and Outputs

### Supported Pipelines
1. **Illumina** (`illumina.r`) - 16S rRNA gene sequencing
2. **IonTorrent** (`iontorrent.R`) - Ion Torrent sequencing 
3. **ITS** (`its.R`) - Fungal ITS sequencing

### Required Output Files
All pipelines now generate these standardized files:

- `alpha_diversity_metrics.csv` - Alpha diversity metrics
- `otu_table.csv` - OTU/ASV abundance table
- `tax_table.csv` - Taxonomic assignments
- `sample_metadata.csv` - Sample metadata
- `pipeline_status.json` - Success/failure status

## Success Status Detection

### Status File Format
```json
{
  "status": "success",
  "message": "Pipeline completed successfully",
  "timestamp": "2025-09-29 10:30:00",
  "pipeline_type": "illumina",
  "files_created": [
    "alpha_diversity_metrics.csv",
    "otu_table.csv", 
    "tax_table.csv",
    "sample_metadata.csv"
  ]
}
```

### Error Detection
- Database saving only occurs when `status` field equals `"success"`
- If status file is missing or status is not "success", data is NOT saved
- This ensures only error-free pipeline results are stored

## Database Schema Mapping

### Pipeline Results → Database Tables

#### 1. `pipeline_results` Table
- Stores file paths and run metadata
- Links to `pipeline_runs` via `run_id`
- Links to `soil` via `soil_id` (created during processing)

#### 2. `soil` Table  
- One record created per pipeline run
- Contains metadata: `Pipeline_{type}_{run_id}`
- Links to user via `owner_id`

#### 3. `alpha_tests` Table
- Alpha diversity metrics from CSV
- Multiple records per soil sample
- Fields: `observed`, `shannon`, `simpson`, `chao1`, `goods`

#### 4. `sample` Table
- Taxonomy and OTU data combined
- One record per ASV/OTU
- Fields: `plant_sequence`, taxonomy hierarchy, OTU counts

## Implementation Details

### New Files Created
1. **`/db/db_functions/pipeline_data_functions.js`**
   - Main processing logic
   - Handles different pipeline types
   - Validates success status
   - Processes CSV files

2. **Updated `/db/utilities/result_processor.js`**
   - Uses new pipeline data functions
   - Maintains backward compatibility
   - Passes pipeline type information

3. **Updated R Pipeline Scripts**
   - Added status file generation
   - Standardized CSV output names
   - Added success/error detection

### Data Processing Flow

1. **Pipeline Execution**
   ```
   Pipeline Completes → Generates CSV Files → Creates Status File
   ```

2. **Database Processing**
   ```
   Check Status File → Validate Success → Read CSV Files → Store in Database
   ```

3. **Error Handling**
   ```
   Status != "success" → Skip Database Saving → Log Warning
   ```

## CSV File Processing

### Alpha Diversity Metrics
```csv
sample,observed,shannon,simpson,chao1,goods
Sample1,150,3.2,0.8,180,0.95
Sample2,120,2.9,0.7,155,0.92
```

### OTU Table  
```csv
sequence,Sample1,Sample2,...
ASV1,45,23,...
ASV2,12,67,...
```

### Taxonomy Table
```csv
sequence,kingdom,phylum,class,order,family,genus,species
ASV1,Bacteria,Proteobacteria,Alphaproteobacteria,...
ASV2,Bacteria,Firmicutes,Bacilli,...
```

### Sample Metadata
```csv
sample
Sample1
Sample2
```

## Database Functions Used

### Core Functions
- `createSoil()` - Creates soil record for pipeline run
- `createAlpha()` - Stores alpha diversity metrics  
- `createSample()` - Stores taxonomy + OTU data
- `createPipelineResult()` - Records file paths and metadata

### Pipeline Functions
- `processPipelineResults()` - Main processing function
- `processAndStoreData()` - CSV data extraction and storage
- `readCSV()` - CSV file reader with error handling

## Error Handling

### Validation Checks
1. **Status File Validation**
   - File exists
   - Valid JSON format
   - Status equals "success"

2. **CSV File Validation** 
   - Required files exist
   - Valid CSV format
   - Required columns present

3. **Database Validation**
   - Soil record creation
   - Data type conversions
   - Constraint checking

### Fallback Behavior
- If new system fails → Falls back to legacy processing
- Logs errors but continues processing
- Records file paths even if data extraction fails

## Usage Examples

### Successful Processing
```javascript
const result = await processPipelineResults(
  'run-123', 
  '/app/results/run-123', 
  'illumina', 
  userId
);
// Result: { success: true, soilId: 456, alphaRecords: 5, sampleRecords: 150 }
```

### Failed Pipeline (No Database Saving)
```javascript
// Status file shows: { "status": "failed", "message": "Error in processing" }
// Result: Error thrown - "Pipeline did not complete successfully"
// No database records created
```

## Monitoring and Logging

### Log Messages
- `[INFO]` Pipeline processing start/end
- `[SUCCESS]` Successful operations  
- `[WARNING]` Missing files or data issues
- `[ERROR]` Processing failures

### Log Locations
- Database logs: `/logs/database-info-{date}.log`
- Worker logs: `/logs/worker-info-{date}.log`

## Testing

### Test Script
Use `test-pipeline-data-processing.js` to validate the system:

```bash
node test-pipeline-data-processing.js
```

### Manual Testing
1. Run a pipeline to completion
2. Check for `pipeline_status.json` with `"status": "success"`
3. Verify CSV files are created
4. Check database for new records in `soil`, `alpha_tests`, `sample` tables

## Pipeline Type Differences

### Illumina Pipeline
- Most complete metadata
- Standard phyloseq output structure
- All required files generated

### IonTorrent Pipeline  
- Demultiplexed data processing
- Uses breakaway for alpha diversity estimation
- Additional barcode processing

### ITS Pipeline
- Fungal-specific processing
- Modified alpha diversity calculations
- Different reference database

## Configuration

### Environment Variables
- `NODE_ENV` - Controls database module loading
- `RESULTS_DIR` - Pipeline output directory

### Database Configuration
- Connection settings in `/db/db.js`
- Schema defined in `/db/schema.sql`

## Troubleshooting

### Common Issues

1. **Status file missing**
   - Check R pipeline completion
   - Verify output directory permissions

2. **CSV files missing**
   - Check R pipeline errors
   - Verify phyloseq object creation

3. **Database connection errors**
   - Check database service status
   - Verify connection credentials

4. **Data type errors**  
   - Check CSV column formats
   - Verify numeric conversions

### Debug Steps
1. Check pipeline logs for R errors
2. Verify status file contents
3. Check CSV file formats  
4. Review database logs
5. Test with minimal dataset
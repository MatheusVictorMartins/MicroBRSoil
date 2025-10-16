# Sample Metadata Implementation Guide

## Overview

This guide explains the newly implemented sample metadata storage system that parses and stores metadata from `metadata.csv` files into the PostgreSQL database.

---

## What Changed?

### ✅ Before (Old System)
- Metadata CSV files were stored on disk
- Only file path was saved in database
- Could NOT query by metadata fields
- Had to read CSV files to access metadata

### ✅ After (New System)
- Metadata CSV files are still stored on disk (backup)
- **Metadata is now PARSED and stored in database**
- **CAN query by Treatment, Site, pH, etc.**
- Fast SQL queries without reading files

---

## Database Schema

### New Table: `sample_metadata`

```sql
CREATE TABLE sample_metadata (
    metadata_id SERIAL PRIMARY KEY,
    soil_id INTEGER NOT NULL,
    run_id UUID NOT NULL,
    sample_id VARCHAR(255) NOT NULL,
    
    -- Common metadata fields (extracted automatically)
    treatment VARCHAR(255),
    site VARCHAR(255),
    condition VARCHAR(255),
    replicate VARCHAR(50),
    group_name VARCHAR(255),
    
    -- Environmental/soil data
    ph FLOAT,
    temperature FLOAT,
    soil_depth INTEGER,
    moisture FLOAT,
    
    -- Flexible storage for ANY custom fields
    custom_fields JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_sample_metadata_soil FOREIGN KEY (soil_id) REFERENCES soil(soil_id),
    CONSTRAINT fk_sample_metadata_run FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id),
    CONSTRAINT unique_sample_per_run UNIQUE (run_id, sample_id)
);
```

---

## How It Works

### 1. Upload Phase
User uploads files including `metadata.csv`:
```
uploads/27eef844-9ceb-44c1-8978-2eca933eb1d3/
├── Sample1_R1_001.fastq.gz
├── Sample1_R2_001.fastq.gz
├── Sample2_R1_001.fastq.gz
├── Sample2_R2_001.fastq.gz
└── metadata.csv  ← User's metadata file
```

### 2. Pipeline Processing
R script processes FASTQ files and generates:
```
results/27eef844-9ceb-44c1-8978-2eca933eb1d3/
├── otu_table.csv
├── tax_table.csv
├── alpha_diversity_metrics.csv
└── sample_metadata.csv  ← Exported from phyloseq
```

### 3. Database Storage (NEW!)
`pipeline_data_functions.js` now:
1. Reads `sample_metadata.csv`
2. **Parses each row**
3. **Extracts common fields** (Treatment, Site, pH, etc.)
4. **Stores remaining fields in JSONB** (custom_fields)
5. **Creates database records**

---

## Supported Metadata Fields

### Automatically Extracted Fields

The system automatically detects and extracts these fields (case-insensitive):

| Database Column | Detected From CSV Columns |
|-----------------|---------------------------|
| `sample_id` | SampleID, sample_id, Sample, sample |
| `treatment` | Treatment, treatment, Group, group |
| `site` | Site, site, Location, location |
| `condition` | Condition, condition, Status, status |
| `replicate` | Replicate, replicate, Rep, rep |
| `group_name` | Group, group, GroupName, group_name |
| `ph` | pH, ph, PH |
| `temperature` | Temperature, temperature, Temp, temp |
| `soil_depth` | soil_depth, SoilDepth, Depth, depth |
| `moisture` | Moisture, moisture, Water, water_content |

### Custom Fields (JSONB)

Any additional columns in your `metadata.csv` are automatically stored in the `custom_fields` JSONB column. Examples:
- Fertilizer_Type
- Irrigation
- Crop_Rotation
- Sampling_Date
- Your_Custom_Column

---

## Example Metadata File

### metadata.csv
```csv
SampleID,Treatment,Site,pH,Temperature,Fertilizer_Type,Irrigation
Sample1,Control,SiteA,6.5,25,None,Rainfed
Sample2,Fertilized,SiteB,7.2,28,NPK,Irrigated
Sample3,Control,SiteA,6.8,24,None,Rainfed
Sample4,Fertilized,SiteC,7.0,26,NPK,Irrigated
```

### What Gets Stored

**Standard Fields (in dedicated columns)**:
- sample_id: Sample1, Sample2, Sample3, Sample4
- treatment: Control, Fertilized
- site: SiteA, SiteB, SiteA, SiteC
- ph: 6.5, 7.2, 6.8, 7.0
- temperature: 25, 28, 24, 26

**Custom Fields (in JSONB)**:
```json
{
  "Fertilizer_Type": "None" | "NPK",
  "Irrigation": "Rainfed" | "Irrigated"
}
```

---

## Database Queries

### Query by Treatment
```sql
SELECT * FROM microbrsoil_db.sample_metadata
WHERE treatment = 'Control';
```

### Query by Site
```sql
SELECT * FROM microbrsoil_db.sample_metadata
WHERE site = 'SiteA';
```

### Query by pH Range
```sql
SELECT * FROM microbrsoil_db.sample_metadata
WHERE ph BETWEEN 6.0 AND 7.5;
```

### Query Custom Fields
```sql
SELECT 
    sample_id,
    treatment,
    custom_fields->>'Fertilizer_Type' as fertilizer
FROM microbrsoil_db.sample_metadata
WHERE custom_fields->>'Irrigation' = 'Irrigated';
```

### Join with Pipeline Runs
```sql
SELECT 
    pr.run_id,
    pr.pipeline_type,
    sm.sample_id,
    sm.treatment,
    sm.site,
    sm.ph
FROM microbrsoil_db.pipeline_runs pr
JOIN microbrsoil_db.sample_metadata sm ON pr.run_id = sm.run_id
WHERE pr.status = 'completed';
```

### Count Samples by Treatment
```sql
SELECT 
    treatment,
    COUNT(*) as sample_count,
    AVG(ph) as avg_ph,
    AVG(temperature) as avg_temp
FROM microbrsoil_db.sample_metadata
GROUP BY treatment;
```

---

## Using the API Functions

### Create Metadata Record
```javascript
const { createSampleMetadata } = require('./db/db_functions/sample_metadata_functions');

await createSampleMetadata({
    soilId: 123,
    runId: '27eef844-9ceb-44c1-8978-2eca933eb1d3',
    sampleId: 'Sample1',
    treatment: 'Control',
    site: 'SiteA',
    ph: 6.5,
    temperature: 25,
    customFields: {
        Fertilizer_Type: 'None',
        Irrigation: 'Rainfed'
    }
});
```

### Query Metadata
```javascript
const { getSampleMetadataByRunId, querySampleMetadata } = require('./db/db_functions/sample_metadata_functions');

// Get all metadata for a run
const metadata = await getSampleMetadataByRunId(runId);

// Query with filters
const filtered = await querySampleMetadata({
    treatment: 'Control',
    site: 'SiteA',
    minPh: 6.0,
    maxPh: 7.0
});
```

---

## Testing the Implementation

### 1. Apply Database Schema

```powershell
# Connect to PostgreSQL
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil

# Run the schema update (if not already applied)
\i /docker-entrypoint-initdb.d/schema.sql

# Verify table exists
SELECT * FROM information_schema.tables 
WHERE table_schema = 'microbrsoil_db' 
AND table_name = 'sample_metadata';
```

### 2. Run a Pipeline with Metadata

```bash
# Upload files including metadata.csv
curl -F "files=@Sample1_R1_001.fastq.gz" \
     -F "files=@Sample1_R2_001.fastq.gz" \
     -F "files=@metadata.csv" \
     http://localhost:3000/upload/illumina
```

### 3. Check Database After Pipeline Completes

```sql
-- View metadata records
SELECT * FROM microbrsoil_db.sample_metadata
ORDER BY created_at DESC;

-- Count records
SELECT COUNT(*) FROM microbrsoil_db.sample_metadata;

-- Check specific run
SELECT * FROM microbrsoil_db.sample_metadata
WHERE run_id = '<your-run-id>';
```

### 4. Test Queries

Use the queries in `test-sample-metadata.sql` to verify:
- ✅ Metadata records were created
- ✅ Fields were parsed correctly
- ✅ Custom fields are in JSONB
- ✅ Can query by treatment, site, pH, etc.

---

## Migration for Existing Data

If you have existing pipeline results without metadata in the database:

### Option 1: Reprocess Pipelines
Re-run the pipeline for existing data - metadata will be automatically parsed and stored.

### Option 2: Batch Import Script
Create a script to parse existing `sample_metadata.csv` files:

```javascript
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createSampleMetadata } = require('./db/db_functions/sample_metadata_functions');

async function importExistingMetadata(runId, soilId, metadataFilePath) {
    const metadataData = [];
    
    // Read CSV
    await new Promise((resolve, reject) => {
        fs.createReadStream(metadataFilePath)
            .pipe(csv())
            .on('data', (row) => metadataData.push(row))
            .on('end', resolve)
            .on('error', reject);
    });
    
    // Import each row
    for (const row of metadataData) {
        await createSampleMetadata({
            soilId,
            runId,
            sampleId: row.SampleID,
            treatment: row.Treatment || null,
            site: row.Site || null,
            ph: parseFloat(row.pH) || null,
            temperature: parseFloat(row.Temperature) || null,
            customFields: { /* ... */ }
        });
    }
}
```

---

## API Endpoints (Future Enhancement)

Consider adding these endpoints to `backend/src/routes/`:

```javascript
// GET /api/metadata/:runId
router.get('/metadata/:runId', async (req, res) => {
    const metadata = await getSampleMetadataByRunId(req.params.runId);
    res.json(metadata.rows);
});

// GET /api/metadata/query
router.get('/metadata/query', async (req, res) => {
    const { treatment, site, minPh, maxPh } = req.query;
    const metadata = await querySampleMetadata({ treatment, site, minPh, maxPh });
    res.json(metadata.rows);
});
```

---

## Benefits

### For Users:
- ✅ Filter samples by treatment or site
- ✅ Find samples with specific pH ranges
- ✅ Group and compare samples by metadata
- ✅ Export subsets based on experimental conditions

### For Developers:
- ✅ Fast SQL queries instead of reading CSV files
- ✅ Relational database queries
- ✅ Join metadata with other tables
- ✅ Aggregate and analyze metadata

### For System:
- ✅ Better data integrity
- ✅ Indexed queries (fast performance)
- ✅ Enforced relationships (foreign keys)
- ✅ Flexible schema (JSONB for custom fields)

---

## Troubleshooting

### Metadata Not Appearing in Database

1. **Check if table exists**:
   ```sql
   SELECT EXISTS (
       SELECT FROM information_schema.tables 
       WHERE table_schema = 'microbrsoil_db' 
       AND table_name = 'sample_metadata'
   );
   ```

2. **Check worker logs**:
   ```bash
   docker-compose logs worker | grep -i metadata
   ```

3. **Check if CSV was read**:
   Look for: `[INFO] Metadata records: X`

4. **Check for errors**:
   Look for: `[ERROR]` or `[WARNING]` related to metadata

### Custom Fields Not Storing

Ensure your column names don't match the reserved names (see "Automatically Extracted Fields" table above).

---

## Files Modified

1. **`db/schema.sql`** - Added `sample_metadata` table
2. **`db/db_functions/sample_metadata_functions.js`** - New file with CRUD functions
3. **`db/db_functions/pipeline_data_functions.js`** - Added metadata parsing logic
4. **`test-sample-metadata.sql`** - Test queries
5. **`METADATA_IMPLEMENTATION_GUIDE.md`** - This file

---

## Next Steps

1. ✅ Apply schema changes (restart database)
2. ✅ Test with a pipeline run that includes metadata.csv
3. ✅ Verify metadata records in database
4. 🔲 Create API endpoints for querying metadata
5. 🔲 Add UI for filtering samples by metadata
6. 🔲 Migrate existing pipeline data (optional)

---

**Last Updated**: October 14, 2025  
**Status**: ✅ Implemented and ready for testing

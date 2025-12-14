# Metadata Flow in MicroBRSoil Pipeline

## Overview

This document explains how metadata is handled throughout the upload, pipeline processing, and database storage workflow in the MicroBRSoil system.

---

## 1. Upload Phase

### File Upload Process

**Location**: `backend/src/routes/upload.js`

When users upload files, the system:

1. **Creates Upload Directory**:
   ```javascript
   const uploadId = req.uploadId || uuidv4();
   const uploadDir = path.join(UPLOADS_DIR, uploadId); // e.g., uploads/0f1a7c2f-75ce-40b3-9543-bd0ecba4aaf7/
   ```

2. **Accepts Multiple Files**:
   - FASTQ files (R1, R2 for paired-end)
   - **Optionally: metadata.csv file**
   - Other reference files

3. **Files Are Stored**:
   ```
   uploads/
   └── <run-id>/
       ├── Sample1_R1_001.fastq.gz
       ├── Sample2_R1_001.fastq.gz
       ├── Sample1_R2_001.fastq.gz
       ├── Sample2_R2_001.fastq.gz
       └── metadata.csv  ← (if uploaded)
   ```

### Current Metadata Upload Status

**⚠️ Important**: Currently, the upload endpoint does **NOT** explicitly handle metadata files separately. All files are uploaded as a generic array.

**What this means**:
- If a user uploads a file named `metadata.csv`, it will be stored in the upload directory
- The system doesn't validate or process it during upload
- The metadata file is detected later during pipeline processing

---

## 2. Pipeline Processing Phase

### Metadata Detection

**Location**: `pipeline-r/pipeline/illumina.r` (Lines ~110-150)

During R pipeline execution:

```r
# Check if metadata file exists in the input directory
metadata_file <- file.path(dirname(path), "metadata.csv")

if (file.exists(metadata_file)) {
  cat("Loading metadata from:", metadata_file, "\n")
  metadata <- read.csv(metadata_file, row.names = 1)
  
  # Validate metadata
  if (nrow(metadata) == 0) {
    warning("Metadata file is empty. Using minimal metadata.\n")
    samples <- data.frame(SampleID = sample.names, row.names = sample.names)
  } else {
    # Align metadata with samples
    samples <- metadata[sample.names, , drop = FALSE]
  }
} else {
  cat("No metadata file found. Creating minimal metadata.\n")
  samples <- data.frame(SampleID = sample.names, row.names = sample.names)
}
```

### Metadata in Phyloseq Object

The metadata is incorporated into the phyloseq object:

```r
ps <- phyloseq(
  otu_table(seqtab.nochim, taxa_are_rows = FALSE),
  tax_table(taxa),
  sample_data(samples)  ← Metadata goes here
)
```

### Metadata Export

**Location**: `pipeline-r/pipeline/illumina.r` (Line ~290)

After processing, metadata is exported:

```r
write.csv(as.data.frame(sample_data(ps)), 
          file.path(result_path, "sample_metadata.csv"))
```

**Output File**: `results/<run-id>/sample_metadata.csv`

This file contains:
- Original metadata columns (if uploaded)
- OR minimal metadata (SampleID only) if no metadata was uploaded

---

## 3. Database Storage Phase

### Pipeline Results Record

**Location**: `db/db_functions/pipeline_data_functions.js`

After pipeline completion, the `processPipelineResults` function:

#### Step 1: Record File Paths

```javascript
// Create pipeline result record with file paths
const pipelineResult = await createPipelineResult({
  runId,
  soilId: null,
  alphaDiversityFile: resultFiles.alpha || null,
  otuTableFile: resultFiles.otu || null,
  taxonomyFile: resultFiles.taxonomy || null,
  metadataFile: resultFiles.metadata || null  ← Path to sample_metadata.csv
});
```

**Database Table**: `pipeline_results`
```sql
CREATE TABLE pipeline_results (
  result_id SERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  soil_id INTEGER,
  alpha_diversity_file TEXT,
  otu_table_file TEXT,
  taxonomy_file TEXT,
  metadata_file TEXT,  ← Stores path to sample_metadata.csv
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Step 2: Read Metadata CSV

```javascript
const metadataData = resultFiles.metadata ? 
  await readCSV(resultFiles.metadata) : [];

writeLog(`\n[INFO] Metadata records: ${metadataData.length}`);
```

### Soil Record Creation

**Location**: `db/db_functions/pipeline_data_functions.js` (Lines ~155-175)

**⚠️ Critical Finding**: Metadata columns are **NOT** individually stored in the database!

Instead:
1. A generic "soil" record is created with placeholder data
2. Only `metadata_description` field contains a reference to the pipeline

```javascript
const soilData = {
  sample_name: `Pipeline_${pipelineType}_${runId}`,
  collection_date: new Date(),
  soil_depth: 0,
  elev: 0,
  env_broad_scale: `${pipelineType.toUpperCase()} Pipeline Results`,
  env_local_scale: 'Bioinformatics Processing',
  env_medium: 'Sequencing Data',
  geo_loc_name: 'Unknown',
  lat_lon: { x: 0, y: 0 },
  Enz_Aril: 0,
  Enz_Beta: 0,
  Enz_Fosf: 0,
  metadata_description: `Results from ${pipelineType} pipeline run ${runId}`,
  owner_id: userId || 1
};

soilRecord = await soilFunctions.createSoil(soilData);
```

**Database Table**: `soil`
```sql
CREATE TABLE soil (
  soil_id SERIAL PRIMARY KEY,
  sample_name VARCHAR(255) NOT NULL,
  collection_date TIMESTAMP NOT NULL,
  -- ... many other fields ...
  metadata_description TEXT,  ← Only this field references pipeline metadata
  owner_id INTEGER NOT NULL
);
```

---

## 4. Current Metadata Storage Summary

### What IS Stored:

1. **File Path Reference**:
   - `pipeline_results.metadata_file` contains path to `sample_metadata.csv`
   - Example: `/app/results/27eef844-9ceb-44c1-8978-2eca933eb1d3/sample_metadata.csv`

2. **Physical CSV File**:
   - `sample_metadata.csv` stored in results directory
   - Contains all metadata columns from original upload (or minimal SampleID)

3. **Soil Record**:
   - Generic placeholder record created
   - `metadata_description` = `"Results from illumina pipeline run <run-id>"`

### What is NOT Stored:

❌ **Individual metadata columns are NOT parsed into database fields**
- Treatment groups
- Site names
- Environmental conditions
- Custom sample annotations
- Etc.

### Where Metadata Lives:

| Location | Format | Contents |
|----------|--------|----------|
| `uploads/<run-id>/metadata.csv` | CSV file | Original uploaded metadata (if provided) |
| `results/<run-id>/sample_metadata.csv` | CSV file | Processed metadata from phyloseq (exported from R) |
| `pipeline_results.metadata_file` | Text path | Path to sample_metadata.csv |
| `soil.metadata_description` | Text | Generic description: "Results from illumina pipeline run X" |

---

## 5. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ UPLOAD PHASE                                                 │
├─────────────────────────────────────────────────────────────┤
│ User uploads files:                                          │
│   - FASTQ files (R1, R2)                                     │
│   - metadata.csv (optional)                                  │
│                                                              │
│ Files stored in: uploads/<run-id>/                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ PIPELINE PROCESSING (R)                                      │
├─────────────────────────────────────────────────────────────┤
│ 1. Check for metadata.csv in uploads/<run-id>/               │
│                                                              │
│ 2. If found:                                                 │
│    → Read metadata.csv                                       │
│    → Validate columns and samples                            │
│    → Merge with phyloseq object                              │
│                                                              │
│ 3. If NOT found:                                             │
│    → Create minimal metadata (SampleID only)                 │
│                                                              │
│ 4. Export: results/<run-id>/sample_metadata.csv              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ DATABASE STORAGE                                             │
├─────────────────────────────────────────────────────────────┤
│ 1. pipeline_results table:                                   │
│    - metadata_file = path to sample_metadata.csv             │
│                                                              │
│ 2. soil table:                                               │
│    - Generic record created                                  │
│    - metadata_description = "Results from pipeline X"        │
│                                                              │
│ ❌ Individual metadata columns NOT stored in DB              │
│ ✅ Full metadata preserved in CSV file                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Issues and Recommendations

### Current Issues:

1. **No Metadata Parsing**:
   - Metadata columns (Treatment, Site, etc.) are not extracted into database
   - Cannot query samples by metadata fields
   - Cannot filter or group by experimental conditions

2. **No Metadata Validation at Upload**:
   - System doesn't validate metadata format during upload
   - Errors only discovered during pipeline processing
   - No feedback to user about required columns

3. **Minimal Database Integration**:
   - Metadata only exists as file path reference
   - Requires reading CSV files for any metadata queries
   - No relational links between metadata and samples

### Recommendations:

#### Short-term (Quick Fixes):

1. **Add Metadata Upload Validation**:
   ```javascript
   // In upload.js
   if (metadata_file) {
     validateMetadataFormat(metadata_file);
     // Check required columns: SampleID
     // Validate sample names match FASTQ files
   }
   ```

2. **Store Key Metadata Fields**:
   - Create `sample_metadata` table
   - Extract at least: SampleID, Treatment, Site, Condition
   - Link to soil_id

#### Long-term (Comprehensive Solution):

1. **Create Metadata Tables**:
   ```sql
   CREATE TABLE sample_metadata (
     metadata_id SERIAL PRIMARY KEY,
     soil_id INTEGER NOT NULL,
     sample_id VARCHAR(255) NOT NULL,
     treatment VARCHAR(255),
     site VARCHAR(255),
     condition VARCHAR(255),
     custom_fields JSONB,  -- For flexible metadata
     FOREIGN KEY (soil_id) REFERENCES soil(soil_id)
   );
   ```

2. **Parse Metadata During Processing**:
   ```javascript
   // In pipeline_data_functions.js
   if (metadataData.length > 0) {
     for (const row of metadataData) {
       await createSampleMetadata({
         soilId,
         sampleId: row.SampleID,
         treatment: row.Treatment || null,
         site: row.Site || null,
         condition: row.Condition || null,
         customFields: row  // Store entire row as JSON
       });
     }
   }
   ```

3. **Enable Metadata Queries**:
   - Search samples by treatment
   - Filter by site/location
   - Compare conditions
   - Export subsets based on metadata

---

## 7. Example Metadata Flow

### Scenario: User uploads Illumina data with metadata

**Step 1: Upload**
```bash
POST /upload/illumina
Files:
  - Sample1_R1_001.fastq.gz
  - Sample1_R2_001.fastq.gz
  - Sample2_R1_001.fastq.gz
  - Sample2_R2_001.fastq.gz
  - metadata.csv
```

**metadata.csv** content:
```csv
SampleID,Treatment,Site,pH,Temperature
Sample1,Control,SiteA,6.5,25
Sample2,Fertilized,SiteB,7.2,28
```

**Step 2: Files stored**
```
uploads/27eef844-9ceb-44c1-8978-2eca933eb1d3/
├── Sample1_R1_001.fastq.gz
├── Sample1_R2_001.fastq.gz
├── Sample2_R1_001.fastq.gz
├── Sample2_R2_001.fastq.gz
└── metadata.csv
```

**Step 3: Pipeline processes**
- R script reads metadata.csv
- Validates samples match FASTQ files
- Includes metadata in phyloseq object
- Exports to sample_metadata.csv

**Step 4: Results stored**
```
results/27eef844-9ceb-44c1-8978-2eca933eb1d3/
├── otu_table.csv
├── tax_table.csv
├── alpha_diversity_metrics.csv
├── sample_metadata.csv  ← Exported metadata
└── ...
```

**Step 5: Database records**

`pipeline_results`:
```sql
run_id: 27eef844-9ceb-44c1-8978-2eca933eb1d3
metadata_file: /app/results/.../sample_metadata.csv
```

`soil`:
```sql
soil_id: 123
sample_name: Pipeline_illumina_27eef844...
metadata_description: Results from illumina pipeline run 27eef844...
-- All other fields: generic placeholders
```

**❌ NOT in database**:
- Treatment column values
- Site column values
- pH values
- Temperature values

**✅ Available only in CSV**:
- All metadata preserved in sample_metadata.csv
- Must read file to access metadata

---

## 8. Code Locations Reference

| Function | File | Purpose |
|----------|------|---------|
| File upload | `backend/src/routes/upload.js` | Receives files and creates upload directory |
| Metadata detection | `pipeline-r/pipeline/illumina.r` (lines ~110-150) | Checks for metadata.csv |
| Metadata validation | `pipeline-r/pipeline/illumina.r` (lines ~110-150) | Validates and aligns metadata |
| Metadata in phyloseq | `pipeline-r/pipeline/illumina.r` (line ~145) | Creates phyloseq with sample_data |
| Metadata export | `pipeline-r/pipeline/illumina.r` (line ~290) | Exports sample_metadata.csv |
| Database storage | `db/db_functions/pipeline_data_functions.js` (lines ~21-120) | Stores file paths only |
| Soil record | `db/db_functions/pipeline_data_functions.js` (lines ~155-175) | Creates generic soil record |

---

## Conclusion

**Current State**:
- ✅ Metadata files are accepted during upload
- ✅ Metadata is processed and validated in R pipeline
- ✅ Metadata is preserved in CSV files
- ✅ File paths are stored in database
- ❌ **Metadata columns are NOT parsed into database tables**
- ❌ Cannot query or filter by metadata values
- ❌ Metadata only accessible by reading CSV files

**Next Steps**:
To enable metadata-based queries and filtering, implement metadata parsing and storage as outlined in the recommendations section.

---

**Last Updated**: October 13, 2025

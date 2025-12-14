# Pipeline Validation and Idempotency Fixes

## Problem Summary
The Illumina pipeline was accepting non-FASTQ files (metadata.csv), marking them as successful despite producing invalid results, experiencing BullMQ lock renewal errors, and creating duplicate database records when jobs were retried.

## Root Causes Identified

### 1. Upload Handler File Selection Bug
**File:** `backend/src/routes/upload.js` line 69
**Issue:** `mainFilePath = files[0].path` after alphabetical sort meant `metadata.csv` would be selected as the FASTQ input since it comes alphabetically before files like `Sample1_R1_001.fastq.gz`

### 2. Missing Pre-Job Validation
**File:** `backend/src/queues/index.js` 
**Issue:** No validation before accepting job into queue - any file path was accepted

### 3. False-Positive Success Detection
**File:** `backend/src/integrations/run_illumina.js` lines 120-134
**Issue:** Only checked if files exist, not their quality - a 2-row alpha diversity file was considered "success"

### 4. BullMQ Lock Renewal Issues
**File:** `backend/src/workers/pipeline.worker.js`
**Issues:** 
- Lock duration (5min) too short for long R processes
- Renewal interval (15s) causing overhead
- clearInterval not in finally block
- No check to prevent retry-after-success

### 5. Missing Database Idempotency
**Files:** `db/db_functions/pipeline_functions.js`, `pipeline_data_functions.js`
**Issue:** Plain INSERT statements would fail or create duplicates on retry

## Fixes Implemented

### ✅ Fix 1: FASTQ File Validation in Upload Handler
**File:** `backend/src/routes/upload.js` lines 53-90

```javascript
// Added pipeline-specific logic
if (pipelineType === 'illumina') {
  // Filter for FASTQ files matching Illumina naming pattern
  const fastqFiles = uploadedFiles.filter(f => 
    f.name.match(/_R[12]_001\.fastq(\.gz)?$/i)
  );
  
  if (fastqFiles.length === 0) {
    // Clean up and reject upload
    fs.rmSync(uploadDir, { recursive: true, force: true });
    return res.status(400).json({ 
      error: 'No valid FASTQ files found. Illumina pipeline requires files matching pattern: *_R1_001.fastq.gz and *_R2_001.fastq.gz',
      filesReceived: uploadedFiles.map(f => f.name)
    });
  }
  
  // Use directory path (not single file) for Illumina
  mainFilePath = path.dirname(files[0].path);
}
```

**Impact:** Prevents metadata.csv from being selected as FASTQ input

### ✅ Fix 2: Pre-Flight Validation in Queue
**File:** `backend/src/queues/index.js` lines 27-60

```javascript
async function addPipelineJob({ runId, fastqPath, pipelineType, meta = {} }) {
  const fs = require('fs');
  const path = require('path');
  
  // ... existing code ...
  
  // Pre-flight validation for Illumina pipeline
  if (pipelineType === 'illumina') {
    let fastqDir;
    
    try {
      const stats = fs.statSync(fastqPath);
      fastqDir = stats.isDirectory() ? fastqPath : path.dirname(fastqPath);
    } catch (err) {
      throw new Error(`Invalid fastqPath: ${fastqPath} does not exist`);
    }
    
    const allFiles = fs.readdirSync(fastqDir);
    const r1Files = allFiles.filter(f => f.match(/_R1_001\.fastq(\.gz)?$/i));
    const r2Files = allFiles.filter(f => f.match(/_R2_001\.fastq(\.gz)?$/i));
    
    if (r1Files.length === 0 || r2Files.length === 0) {
      throw new Error(
        `No valid paired-end FASTQ files found in ${fastqDir}. ` +
        `Found files: ${allFiles.join(', ')}`
      );
    }
    
    console.log(`✅ Validated FASTQ files for runId ${runId}: ${r1Files.length} R1 files, ${r2Files.length} R2 files`);
  }
  
  // ... continue with job creation ...
}
```

**Impact:** Rejects jobs before execution if FASTQ files are missing

### ✅ Fix 3: Output Quality Validation
**File:** `backend/src/integrations/run_illumina.js` lines 121-171

```javascript
// Enhanced validation with size and row count checks
const expectedFiles = [
  { name: 'otu_table.csv', minSize: 500, minRows: 10 },
  { name: 'tax_table.csv', minSize: 1000, minRows: 50 },
  { name: 'sample_metadata.csv', minSize: 100, minRows: 2 },
  { name: 'phyloseq_object.rds', minSize: 1000, minRows: null }
];

const missingFiles = [];
const invalidFiles = [];

for (const fileSpec of expectedFiles) {
  const filePath = path.join(outputDir, fileSpec.name);
  
  if (!fs.existsSync(filePath)) {
    missingFiles.push(fileSpec.name);
    continue;
  }
  
  // Check file size
  const stats = fs.statSync(filePath);
  if (stats.size < fileSpec.minSize) {
    invalidFiles.push(`${fileSpec.name} (only ${stats.size} bytes)`);
    continue;
  }
  
  // For CSV files, validate row count
  if (fileSpec.minRows && fileSpec.name.endsWith('.csv')) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const dataRows = lines.length - 1; // Exclude header
    
    if (dataRows < fileSpec.minRows) {
      invalidFiles.push(`${fileSpec.name} (only ${dataRows} rows, expected >${fileSpec.minRows})`);
    }
  }
}

if (missingFiles.length > 0 || invalidFiles.length > 0) {
  const errorMsg = [];
  if (missingFiles.length > 0) {
    errorMsg.push(`Missing files: ${missingFiles.join(', ')}`);
  }
  if (invalidFiles.length > 0) {
    errorMsg.push(`Invalid/incomplete files: ${invalidFiles.join(', ')}`);
  }
  
  throw new Error('Pipeline completed but output files are missing or invalid...');
}
```

**Impact:** Catches incomplete/failed pipeline runs before marking them as successful

### ✅ Fix 4: BullMQ Lock Management
**File:** `backend/src/workers/pipeline.worker.js`

**Changes:**
1. Added job state check to prevent retry-after-success (lines 31-35)
2. Increased lock duration from 5min to 10min (line 33)
3. Adjusted renewal interval from 15s to 30s for stability (line 40)
4. Moved clearInterval to finally block (lines 117-128)
5. Updated worker configuration (lines 131-137)

```javascript
try {
  // Prevent retry-after-success
  const state = await job.getState();
  if (state === 'completed') {
    return { success: true, runId, skipped: true, reason: 'already_completed' };
  }
  
  // Lock renewal with longer duration
  lockRenewalInterval = setInterval(async () => {
    try {
      await job.extendLock(job.token, 600000); // 10 minutes (was 5)
    } catch (error) {
      workerLogger.warn(`Failed to renew lock: ${error.message}`);
    }
  }, 30000); // Every 30 seconds (was 15)
  
  // ... pipeline execution ...
  
} catch (error) {
  // ... error handling ...
} finally {
  // Always clear interval
  if (lockRenewalInterval) {
    clearInterval(lockRenewalInterval);
  }
  
  // Final lock extension for BullMQ finalization
  try {
    await job.extendLock(job.token, 60000);
  } catch (lockError) {
    // Not critical
  }
}
```

**Worker config updates:**
```javascript
{
  connection,
  concurrency: 1,
  stalledInterval: 120 * 1000, // 2 minutes (was 90s)
  maxStalledCount: 2, // Reduced from 3 to prevent duplicates
  lockDuration: 600 * 1000, // 10 minutes (was 5)
  lockRenewTime: 300 * 1000, // 5 minutes (was 2.5)
}
```

**Impact:** Prevents lock renewal failures and duplicate job execution

### ✅ Fix 5: Database Idempotency
**Files:** 
- `db/db_functions/pipeline_functions.js` - UPSERT for pipeline_results
- `db/db_functions/pipeline_data_functions.js` - Reuse existing soil on retry
- `db/migrations/add_idempotency_constraints.sql` - Schema constraints

**Change 1: UPSERT for pipeline_results**
```javascript
const query = `
  INSERT INTO microbrsoil_db.pipeline_results 
  (run_id, soil_id, alpha_diversity_file, otu_table_file, taxonomy_file, metadata_file, processed_at)
  VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
  ON CONFLICT (run_id) 
  DO UPDATE SET
    soil_id = EXCLUDED.soil_id,
    alpha_diversity_file = EXCLUDED.alpha_diversity_file,
    otu_table_file = EXCLUDED.otu_table_file,
    taxonomy_file = EXCLUDED.taxonomy_file,
    metadata_file = EXCLUDED.metadata_file,
    processed_at = CURRENT_TIMESTAMP
  RETURNING *`;
```

**Change 2: Reuse existing soil on retry**
```javascript
// Check if soil record already exists for this run
let existingSoilId = null;
const existingResult = await pool.query(
  'SELECT soil_id FROM microbrsoil_db.pipeline_results WHERE run_id = $1 AND soil_id IS NOT NULL',
  [runId]
);
if (existingResult.rows.length > 0) {
  existingSoilId = existingResult.rows[0].soil_id;
  writeLog(`\n[INFO] Reusing existing soil_id ${existingSoilId} for retry of run ${runId}`);
}

// Delete old alpha/sample records if retrying
if (existingSoilId) {
  await pool.query('DELETE FROM microbrsoil_db.alpha_tests WHERE soil_id = $1', [soilId]);
  await pool.query('DELETE FROM microbrsoil_db.sample WHERE soil_id = $1', [soilId]);
  writeLog(`\n[INFO] Deleted old records for retry cleanup`);
}
```

**Change 3: Schema constraint (to be applied)**
```sql
ALTER TABLE microbrsoil_db.pipeline_results 
ADD CONSTRAINT unique_pipeline_result_per_run UNIQUE (run_id);
```

**Impact:** Prevents duplicate database records when jobs are retried

## Testing Checklist

### Before Rebuild
1. ✅ All fixes implemented in code
2. ✅ Schema migration file created

### After Rebuild
1. [ ] Apply database migration: `docker exec -i microbrsoil-db-1 psql -U postgres -d microbrsoil_db < db/migrations/add_idempotency_constraints.sql`
2. [ ] Test upload with metadata.csv only → should reject with clear error
3. [ ] Test upload with FASTQ + metadata.csv → should accept and process
4. [ ] Test pipeline with corrupted FASTQ → should fail with validation error
5. [ ] Monitor BullMQ logs for lock renewal errors → should be eliminated
6. [ ] Verify database after successful run → result_id should remain 1 (not increment)
7. [ ] Manually retry completed job → should skip execution, not create duplicates

## Validation Commands

### Check for FASTQ files in upload directory
```bash
docker exec microbrsoil-backend-1 ls -la /app/uploads/<run_id>/
```

### Check pipeline_results table for duplicates
```sql
SELECT run_id, COUNT(*) as count 
FROM microbrsoil_db.pipeline_results 
GROUP BY run_id 
HAVING COUNT(*) > 1;
```

### Monitor BullMQ job status
```bash
docker exec -it microbrsoil-redis-1 redis-cli
> KEYS bull:pipeline-jobs:*
> HGETALL bull:pipeline-jobs:<job_id>
```

### Check worker logs for lock errors
```bash
docker logs microbrsoil-backend-worker-1 2>&1 | grep -i "lock\|stalled\|Missing"
```

## Expected Behavior After Fixes

### Upload Phase
- ✅ Reject uploads with no FASTQ files
- ✅ Accept uploads with valid *_R1_001.fastq.gz and *_R2_001.fastq.gz files
- ✅ Pass directory path (not file path) to pipeline

### Queue Phase
- ✅ Validate FASTQ files exist before job acceptance
- ✅ Reject jobs with clear error message if no FASTQ pairs found

### Execution Phase
- ✅ R script receives directory path with all FASTQ files
- ✅ Pipeline produces output files meeting minimum size/row requirements
- ✅ Validation error thrown if outputs are too small/empty
- ✅ Lock renewed every 30s with 10min duration
- ✅ Lock interval cleared in finally block

### Database Phase
- ✅ pipeline_results uses UPSERT (no constraint violation)
- ✅ Existing soil_id reused on retry
- ✅ Old alpha/sample records deleted before re-insert
- ✅ result_id remains consistent across retries

### Retry Behavior
- ✅ Job state checked before execution
- ✅ Completed jobs skip re-execution
- ✅ Database records updated (not duplicated)
- ✅ No "Missing lock" errors in logs

## Related Files Modified

1. `backend/src/routes/upload.js` - Upload validation
2. `backend/src/queues/index.js` - Pre-job validation
3. `backend/src/integrations/run_illumina.js` - Output validation
4. `backend/src/workers/pipeline.worker.js` - Lock management
5. `db/db_functions/pipeline_functions.js` - UPSERT for results
6. `db/db_functions/pipeline_data_functions.js` - Idempotent processing
7. `db/migrations/add_idempotency_constraints.sql` - Schema changes

## Rollback Instructions

If issues occur, revert changes in this order:
1. Remove unique constraint: `ALTER TABLE microbrsoil_db.pipeline_results DROP CONSTRAINT IF EXISTS unique_pipeline_result_per_run;`
2. Restore worker config to original values
3. Revert upload.js FASTQ validation
4. Clear Redis queue: `docker exec microbrsoil-redis-1 redis-cli FLUSHALL`
5. Restart backend: `docker-compose restart backend backend-worker`

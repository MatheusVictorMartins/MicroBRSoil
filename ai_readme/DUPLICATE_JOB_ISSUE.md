# Duplicate Pipeline Job Issue - Analysis and Solution

## Issue Summary
After successfully completing pipeline job `c8b59844-1a3e-4129-98a7-69a9c986ce66`, a duplicate job `33a15e1a-ccb1-4ef8-9362-6fa55a298049` was automatically started.

## Root Cause

### Timeline of Events:
1. **First job completed successfully** (c8b59844-1a3e-4129-98a7-69a9c986ce66)
   - Status: `completed`
   - Finished at: 2025-10-14T23:02:31.160Z
   - Successfully processed 2 alpha diversity records and 18 sample records
   - Soil ID: 4 created with correct metadata

2. **Lock expiration error occurred**:
   ```
   Error: Missing lock for job c8b59844-1a3e-4129-98a7-69a9c986ce66. moveToDelayed
   ```

3. **BullMQ triggered automatic retry**:
   - Second job started: 33a15e1a-ccb1-4ef8-9362-6fa55a298049
   - Using the SAME upload directory (different job ID created earlier)
   - Currently running the Illumina pipeline again

### Technical Cause

**Queue Configuration (`backend/src/queues/index.js` line 28-30)**:
```javascript
const job = await queue.add('run', { runId, fastqPath, pipelineType, meta }, {
    attempts: 3,  // ❌ ALLOWS UP TO 3 RETRIES
    backoff: { type: 'exponential', delay: 5000 },
```

**Lock Management Issue**:
- The lock renewal interval clears AFTER successful completion
- There's a race condition between:
  1. Job completion processing (lines 102-112 in pipeline.worker.js)
  2. Lock expiration
  3. BullMQ's internal job finalization

## Impact

### Current Situation:
✅ **First job**: Completed successfully, data stored in database
⚠️ **Second job**: Running as an unwanted retry, will process the same data again

### Potential Problems:
1. **Duplicate data**: Will create duplicate soil, alpha, and sample records
2. **Resource waste**: Running a 1-hour pipeline unnecessarily
3. **Database inconsistency**: Multiple soil records for the same sample

## Solutions

### Option 1: Disable Retries (Recommended for Long Jobs)
Pipeline jobs are long-running (45-60 minutes) and should not be retried automatically:

```javascript
// backend/src/queues/index.js line 28
const job = await queue.add('run', { runId, fastqPath, pipelineType, meta }, {
    attempts: 1,  // ✅ No automatic retries
    backoff: { type: 'exponential', delay: 5000 },
    // ... rest of config
```

**Pros**:
- Prevents duplicate processing
- Failed jobs can be manually resubmitted by users
- Cleaner job tracking

**Cons**:
- Transient errors won't auto-recover

### Option 2: Add Idempotency Check
Before processing results, check if data already exists:

```javascript
// In processPipelineResults function
const existingResult = await db.query(
  'SELECT * FROM pipeline_results WHERE run_id = $1',
  [runId]
);

if (existingResult.rows.length > 0) {
  console.log('Results already processed for run', runId);
  return; // Skip processing
}
```

**Pros**:
- Allows retries for legitimate failures
- Safe against duplicate processing

**Cons**:
- More complex logic
- Still wastes resources on duplicate pipeline execution

### Option 3: Improve Lock Management (Complex)
Move lock clearing to after all async operations:

```javascript
// pipeline.worker.js
try {
  // ... pipeline execution ...
  await processPipelineResults(runId, runOutputDir, userId, pipelineType);
  await updatePipelineRunStatus(runId, 'completed', null, pipelines[runId].logs);
  
  // Clear lock renewal LAST
  if (lockRenewalInterval) clearInterval(lockRenewalInterval);
  
  return { success: true, runId, outputDir: runOutputDir, result };
} catch (error) {
  // ...
}
```

## Recommended Action Plan

### Immediate (Stop Current Duplicate):
1. Monitor the second job - let it complete or manually stop it
2. Check database for duplicate records
3. Clean up any duplicates if necessary

### Short-term Fix (Prevent Future Duplicates):
**Change retry attempts to 1**:
```bash
# Edit backend/src/queues/index.js line 28
attempts: 1,  # Change from 3 to 1
```

### Long-term Enhancement:
1. Add idempotency check in `processPipelineResults`
2. Improve error handling to distinguish retryable vs non-retryable errors
3. Add manual retry endpoint for users to resubmit failed jobs

## Verification Steps

After applying fix:
1. Upload new FASTQ files
2. Monitor that only ONE job is created
3. If job fails, verify NO automatic retry occurs
4. Test manual retry functionality (if implemented)

## Current Job Status

**Run ID: 33a15e1a-ccb1-4ef8-9362-6fa55a298049**
- Upload directory: `/app/uploads/33a15e1a-ccb1-4ef8-9362-6fa55a298049/`
- Contains: Test01, Test02, Test03 FASTQ files (6 files total)
- Status: Currently running (started at 2025-10-14T23:02:41.503Z)
- This is processing the SAME data as the first upload (different folder, same files)

## Related Files
- `backend/src/queues/index.js` - Queue configuration
- `backend/src/workers/pipeline.worker.js` - Worker logic
- `db/db_functions/pipeline_data_functions.js` - Result processing

---
**Date**: October 14, 2025
**Priority**: HIGH - Prevents duplicate data processing

# Pipeline Fixes Applied

## Issues Addressed

### 1. Phyloseq Object Creation Error
**Error**: `invalid class "phyloseq" object: Component sample names do not match`

**Root Cause**: Sample names were inconsistent between different pipeline components (OTU table, sample data, tax table).

**Fixes Applied**:
- **Sample Name Synchronization**: Added explicit sample name assignments to ensure consistency across all pipeline objects:
  - `names(mergers) <- sample.names` after mergePairs
  - `rownames(seqtab.nochim) <- sample.names` before phyloseq creation
  - Added validation check before phyloseq object creation

- **Debugging Output**: Added debug logging to track sample names throughout the pipeline
- **Filtered Sample Handling**: Added logic to handle samples that get completely filtered out during quality control

### 2. BullMQ Job Stalling Issue
**Error**: `could not renew lock for job ... job stalled more than allowable limit`

**Root Cause**: Long-running DADA2 pipeline jobs exceeded BullMQ's default lock timeout without proper lock renewal.

**Fixes Applied**:
- **Lock Renewal**: Added periodic lock renewal every 30 seconds to keep long-running jobs alive
- **Worker Configuration**: Updated worker settings:
  - `concurrency: 1` to prevent resource conflicts
  - `stalledInterval: 60 * 1000` (60 seconds)
  - `maxStalledCount: 3` (allow up to 3 stalls)
  - `lockDuration: 120 * 1000` (2 minutes lock duration)
- **Job Progress Updates**: Regular progress updates to signal job is still active
- **Cleanup**: Proper cleanup of lock renewal intervals on job completion/failure

## Files Modified

### 1. `pipeline-r/pipeline/illumina.r`
- Added sample name consistency validation
- Added debug logging for sample name tracking
- Added handling for completely filtered samples
- Ensured all phyloseq components have matching sample names

### 2. `backend/src/workers/pipeline.worker.js`
- Added periodic lock renewal mechanism
- Updated worker configuration for long-running jobs
- Added proper cleanup of lock renewal intervals

### 3. `backend/src/queues/index.js`
- Updated job configuration for extended timeouts
- Improved job options for pipeline jobs

## Testing Recommendations

1. **Test with Sample Data**: Run the pipeline with a small test dataset to verify:
   - No phyloseq creation errors
   - Consistent sample names throughout
   - Jobs complete without stalling

2. **Monitor Logs**: Check for:
   - Debug output showing consistent sample names
   - Lock renewal messages in worker logs
   - No "job stalled" errors

3. **Verify Results**: Ensure generated files have:
   - Matching sample names in all output CSV files
   - Valid phyloseq object saved as RDS
   - Complete alpha and beta diversity outputs

## Expected Behavior

- **Sample Name Consistency**: All components of the phyloseq object will have matching sample names
- **No Job Stalling**: Long-running pipeline jobs will maintain their locks through periodic renewal
- **Robust Error Handling**: Pipeline will handle edge cases like completely filtered samples
- **Clear Debugging**: Debug output will help track sample names through the pipeline

The fixes ensure that the illumina pipeline can successfully create phyloseq objects and complete long-running jobs without BullMQ timeout issues.
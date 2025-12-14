# Deployment Guide for Pipeline Fixes

## Overview
This guide walks you through applying the pipeline validation and idempotency fixes.

## Prerequisites
- Docker and docker-compose running
- Access to database container
- Backup of current database (recommended)

## Step 1: Backup Database (Optional but Recommended)

```powershell
# Create backup directory
mkdir -p backups

# Export current database
docker exec microbrsoil-db-1 pg_dump -U postgres microbrsoil_db > backups/microbrsoil_db_$(Get-Date -Format "yyyyMMdd_HHmmss").sql
```

## Step 2: Rebuild Backend Containers

```powershell
# Stop and remove existing containers
docker-compose down

# Rebuild backend and worker images
docker-compose build backend backend-worker

# Start all services
docker-compose up -d
```

## Step 3: Apply Database Migration

```powershell
# Check if constraint already exists
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='pipeline_results' AND constraint_name='unique_pipeline_result_per_run';"

# If not exists, apply migration
docker exec -i microbrsoil-db-1 psql -U postgres -d microbrsoil_db < db/migrations/add_idempotency_constraints.sql

# Verify constraint was added
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "\d microbrsoil_db.pipeline_results"
```

## Step 4: Clear Redis Queue (Optional)

If you have stalled jobs from before the fix:

```powershell
# Clear all Redis keys
docker exec microbrsoil-redis-1 redis-cli FLUSHALL

# Or selectively clear pipeline queue
docker exec microbrsoil-redis-1 redis-cli --scan --pattern "bull:pipeline-jobs:*" | ForEach-Object { docker exec microbrsoil-redis-1 redis-cli DEL $_ }
```

## Step 5: Verify Services

```powershell
# Check backend logs
docker logs microbrsoil-backend-1 --tail 50

# Check worker logs
docker logs microbrsoil-backend-worker-1 --tail 50

# Check for errors
docker logs microbrsoil-backend-worker-1 2>&1 | Select-String -Pattern "error|lock|stalled" -Context 2,2
```

## Step 6: Test Upload with Invalid File

### Test Case 1: Upload only metadata.csv (should fail)

1. Go to http://localhost:8080/upload.html
2. Select Illumina pipeline
3. Upload only `metadata.csv`
4. **Expected Result:** Red error message: "No valid FASTQ files found. Illumina pipeline requires files matching pattern: *_R1_001.fastq.gz and *_R2_001.fastq.gz"

### Test Case 2: Upload FASTQ + metadata (should succeed)

1. Go to http://localhost:8080/upload.html
2. Select Illumina pipeline
3. Upload:
   - `Sample1_R1_001.fastq.gz`
   - `Sample1_R2_001.fastq.gz`
   - `metadata.csv` (optional)
4. **Expected Result:** Green success message with job ID

## Step 7: Monitor Pipeline Execution

```powershell
# Get the runId from upload response, then:
$runId = "YOUR_RUN_ID_HERE"

# Check job status in Redis
docker exec microbrsoil-redis-1 redis-cli HGETALL "bull:pipeline-jobs:$runId"

# Watch worker logs in real-time
docker logs -f microbrsoil-backend-worker-1

# Check pipeline_runs table
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "SELECT run_id, status, error_message FROM microbrsoil_db.pipeline_runs WHERE run_id = '$runId';"
```

## Step 8: Verify No Duplicates

After a successful pipeline run:

```powershell
# Check for duplicate pipeline_results
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "SELECT run_id, COUNT(*) as count FROM microbrsoil_db.pipeline_results GROUP BY run_id HAVING COUNT(*) > 1;"

# Should return no rows
```

## Step 9: Test Retry Behavior (Optional)

To verify idempotency, manually trigger a retry:

```powershell
# Find a completed job
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "SELECT run_id, result_id, soil_id FROM microbrsoil_db.pipeline_results WHERE soil_id IS NOT NULL LIMIT 1;"

# Note the result_id value (e.g., 1)

# Manually re-queue the job (requires Node.js script or API call)
# The result_id should remain the same after retry
```

## Troubleshooting

### Issue: "constraint already exists" error during migration

**Solution:** The constraint was already applied. Skip migration step.

### Issue: Upload still accepts metadata.csv

**Checklist:**
1. Verify backend was rebuilt: `docker images | Select-String microbrsoil-backend`
2. Check backend code: `docker exec microbrsoil-backend-1 cat /app/src/routes/upload.js | Select-String -Pattern "fastqFiles.length === 0"`
3. Restart backend: `docker-compose restart backend`

### Issue: Lock renewal errors still appearing in logs

**Checklist:**
1. Verify worker was rebuilt
2. Check worker config: `docker exec microbrsoil-backend-worker-1 cat /app/src/workers/pipeline.worker.js | Select-String -Pattern "lockDuration"`
3. Clear Redis: `docker exec microbrsoil-redis-1 redis-cli FLUSHALL`
4. Restart worker: `docker-compose restart backend-worker`

### Issue: Duplicate database records after retry

**Checklist:**
1. Verify migration was applied: `docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "\d microbrsoil_db.pipeline_results"`
2. Check for UNIQUE constraint on run_id column
3. Verify UPSERT logic: `docker exec microbrsoil-backend-1 cat /app/db/db_functions/pipeline_functions.js | Select-String -Pattern "ON CONFLICT"`

### Issue: Pipeline fails with "output files are missing or invalid"

**This is expected behavior!** The fix is working correctly. Possible causes:
1. Input FASTQ files are corrupted or empty
2. R script failed during processing (check logs)
3. Metadata parsing failed (check uploaded metadata format)

**Check R script logs:**
```powershell
docker logs microbrsoil-backend-worker-1 2>&1 | Select-String -Pattern "R script|illumina.r" -Context 5,5
```

## Rollback Procedure

If critical issues occur:

```powershell
# 1. Stop services
docker-compose down

# 2. Restore database backup
docker exec -i microbrsoil-db-1 psql -U postgres -d microbrsoil_db < backups/microbrsoil_db_YYYYMMDD_HHMMSS.sql

# 3. Revert code changes (use git)
git checkout HEAD~1 backend/src/routes/upload.js
git checkout HEAD~1 backend/src/queues/index.js
git checkout HEAD~1 backend/src/integrations/run_illumina.js
git checkout HEAD~1 backend/src/workers/pipeline.worker.js
git checkout HEAD~1 db/db_functions/pipeline_functions.js
git checkout HEAD~1 db/db_functions/pipeline_data_functions.js

# 4. Rebuild and restart
docker-compose build backend backend-worker
docker-compose up -d

# 5. Remove constraint
docker exec -i microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "ALTER TABLE microbrsoil_db.pipeline_results DROP CONSTRAINT IF EXISTS unique_pipeline_result_per_run;"
```

## Success Criteria

✅ **All checks must pass:**

1. Upload with only metadata.csv is **rejected** with clear error message
2. Upload with FASTQ files is **accepted** and queued successfully
3. Pipeline processes FASTQ files and produces valid output
4. Worker logs show **no "Missing lock"** errors
5. Database has **no duplicate** pipeline_results for the same run_id
6. Retry of completed job **skips execution** and reuses existing data
7. Alpha diversity tables have **>=10 rows** (not 2)
8. Taxonomy tables have **>=50 rows** (not 18)

## Post-Deployment Monitoring

Monitor for the first 24 hours:

```powershell
# Check error logs every hour
docker logs microbrsoil-backend-1 --since 1h 2>&1 | Select-String -Pattern "error" -CaseSensitive

# Check for stalled jobs
docker exec microbrsoil-redis-1 redis-cli KEYS "bull:pipeline-jobs:*:stalled"

# Check pipeline success rate
docker exec -it microbrsoil-db-1 psql -U postgres -d microbrsoil_db -c "SELECT status, COUNT(*) FROM microbrsoil_db.pipeline_runs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY status;"
```

## Support

If issues persist:
1. Collect logs: `docker-compose logs > deployment_logs.txt`
2. Export database state: `docker exec microbrsoil-db-1 pg_dump -U postgres microbrsoil_db > db_state.sql`
3. Review `PIPELINE_VALIDATION_FIXES.md` for technical details
4. Check for open issues in project repository

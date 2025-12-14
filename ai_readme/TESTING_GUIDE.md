# Testing Guide for Illumina Pipeline Fixes

## Quick Start

### 1. Test R Package Dependencies

```powershell
# From the project root
Rscript test-illumina-fixes.R
```

Expected output: All checks should pass with ✓ marks

---

## 2. Test with Docker Container

### Build and Start Containers

```powershell
# Build the worker container with updated code
docker-compose build worker

# Start the services
docker-compose up -d
```

### Monitor Worker Logs

```powershell
# Follow worker logs in real-time
docker-compose logs -f worker

# Look for:
# - "Starting Illumina DADA2 Pipeline" header
# - Step-by-step execution logs (Step 1-12)
# - Merge rate statistics
# - Warning messages (if any)
# - "Pipeline completed successfully" message
```

---

## 3. Test Scenarios

### Scenario A: Normal Run (Happy Path)

**Setup**: Use properly formatted paired-end Illumina reads with metadata

**Expected Results**:
- ✅ All steps complete successfully
- ✅ Merge rate >50%
- ✅ All output files created
- ✅ No warnings in logs

**Check files in results directory**:
```powershell
ls results/<run-id>/
# Should contain:
# - otu_table.csv
# - tax_table.csv
# - sample_metadata.csv
# - alpha_diversity_metrics.csv
# - phyloseq_object.rds
# - taxa_barplot_genus.png
# - beta_diversity_pcoa.png
# - pipeline_summary_stats.csv
# - pipeline_status.json
```

---

### Scenario B: Missing Metadata

**Setup**: Remove metadata.csv from upload directory

**Expected Results**:
- ✅ Pipeline completes successfully
- ⚠️ Warning: "No metadata file found. Creating minimal metadata."
- ✅ sample_metadata.csv created with SampleID only
- ✅ Beta diversity plot created without color grouping

**Validation**:
```powershell
# Check the sample_metadata.csv
cat results/<run-id>/sample_metadata.csv
# Should show only SampleID column
```

---

### Scenario C: Poor Merge Conditions

**Setup**: Use reads with insufficient overlap or low quality

**Expected Results**:
- ⚠️ Warning: "Low merge rate (<50%)" or "VERY LOW merge rate (<10%)"
- ✅ Pipeline completes despite low merge rate
- ✅ Merge rate statistics logged in pipeline_summary_stats.csv
- ℹ️ Suggestions printed for improving merge rates

**Check logs**:
```powershell
docker-compose logs worker | grep -i "merge"
# Should show per-sample merge rates and warnings
```

---

### Scenario D: Over-Filtered Data

**Setup**: Set very strict filtering parameters or use low-quality reads

**Expected Results**:
- ⚠️ Warning: "No singletons detected. Chao1 estimation may be unreliable."
- ✅ Chao1 falls back to observed richness
- ✅ alpha_diversity_metrics.csv created with all metrics

**Validation**:
```powershell
# Check alpha diversity output
cat results/<run-id>/alpha_diversity_metrics.csv
# Chao1 should equal Observed when no singletons
```

---

### Scenario E: Lock Renewal Test (Long Job)

**Setup**: Run pipeline with large dataset (many samples)

**Expected Results**:
- ✅ Lock renewed every 15 seconds
- ✅ No "stalled" messages in logs
- ✅ Job completes without timeout

**Monitor**:
```powershell
# Watch for lock renewal messages
docker-compose logs worker | grep -i "renewed lock"
# Should appear every ~15 seconds during R execution
```

---

## 4. Validate Output Files

### Check Pipeline Status

```powershell
# View the pipeline status JSON
cat results/<run-id>/pipeline_status.json | jq .
```

Expected structure:
```json
{
  "status": "success",
  "message": "Pipeline finalizado com sucesso",
  "timestamp": "2025-10-13T...",
  "pipeline_type": "illumina",
  "summary": {
    "samples": 3,
    "taxa": 1234,
    "total_reads": 56789,
    "avg_merge_rate": 85.5,
    "warnings": "None"
  },
  "files_created": [...]
}
```

### Check Summary Statistics

```powershell
cat results/<run-id>/pipeline_summary_stats.csv
```

Should show:
- total_samples
- total_taxa
- total_reads
- avg_reads_per_sample
- avg_taxa_per_sample
- avg_merge_rate_pct
- chimera_fraction_pct

---

## 5. Error Handling Tests

### Test R Script Crash Recovery

**Setup**: Intentionally corrupt a FASTQ file or remove reference database

**Expected Results**:
- ❌ Pipeline fails with clear error message
- ✅ Worker doesn't stall
- ✅ Error logged to database
- ✅ Job marked as "failed" in queue

**Check**:
```powershell
# Verify worker is still responsive
docker-compose exec worker ps aux
# Should show worker process running

# Check database status
# Job status should be 'failed' with error message
```

---

## 6. Performance Checks

### Lock Duration

```powershell
# Verify lock settings
docker-compose logs worker | grep -i "lock duration"
# Should show 300000ms (5 minutes)
```

### Execution Time

```powershell
# Check pipeline_status.json for timestamp
# Or check worker logs for execution time:
docker-compose logs worker | grep -i "execution time"
```

---

## 7. Regression Tests

Run these to ensure no functionality was broken:

1. **IonTorrent pipeline still works**
   ```powershell
   # Submit an IonTorrent job
   # Verify it completes successfully
   ```

2. **ITS pipeline still works**
   ```powershell
   # Submit an ITS job
   # Verify it completes successfully
   ```

3. **Database saving still works**
   ```powershell
   # Check that results are saved to database
   # Verify all CSV files are linked correctly
   ```

---

## 8. Common Issues and Solutions

### Issue: "All samples were filtered out"

**Cause**: Filtering parameters too strict for data quality

**Solution**: 
- Adjust truncLen in illumina.r (currently 240, 200)
- Lower maxEE values if needed
- Check input data quality with FastQC

### Issue: "Lock renewal failed"

**Cause**: Worker under heavy load or network issues

**Solution**:
- Check worker resources (CPU, memory)
- Increase lock renewal interval if needed
- Check Redis connection

### Issue: "No metadata file found"

**Cause**: Expected behavior when metadata.csv not uploaded

**Solution**: This is handled automatically - pipeline creates minimal metadata

### Issue: Plots not generated

**Cause**: Insufficient data or taxonomic assignments

**Solution**: 
- Check if taxa were assigned (tax_table.csv)
- Verify samples have enough reads
- Review R logs for specific plot errors

---

## 9. Cleanup After Testing

```powershell
# Stop containers
docker-compose down

# Remove test results (optional)
rm -r results/*

# Clear logs (optional)
docker-compose logs worker > worker-test-logs.txt
docker-compose down -v  # Remove volumes
```

---

## 10. Success Criteria

All fixes are working correctly if:

- ✅ Pipeline completes with missing metadata
- ✅ Low merge rates don't crash pipeline
- ✅ Plots gracefully handle missing covariates
- ✅ Richness estimation works without singletons
- ✅ Worker doesn't stall during long jobs
- ✅ Errors are clearly logged and reported
- ✅ Output files match expectations
- ✅ Status JSON contains valid summary

---

## Additional Resources

- **Full documentation**: See `PIPELINE_FIXES_SUMMARY.md`
- **Changelog**: See `CHANGELOG_PIPELINE_FIXES.md`
- **R validation**: Run `test-illumina-fixes.R`

---

**Last Updated**: October 13, 2025

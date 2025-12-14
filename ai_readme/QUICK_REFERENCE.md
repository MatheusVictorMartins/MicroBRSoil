# Illumina Pipeline Fixes - Quick Reference Card

## 🎯 What Changed?

### R Script (`pipeline-r/pipeline/illumina.r`)
- ✅ Handles missing/empty metadata gracefully
- ✅ Detects and uses available covariates for plots
- ✅ Improved read merging (truncLen: 240, 200 instead of 240, 160)
- ✅ Logs merge rates and warns if <50%
- ✅ Handles singletons in richness estimation
- ✅ All plots wrapped in tryCatch (won't crash pipeline)
- ✅ Modern ggplot2 syntax (no deprecated aes_string)
- ✅ Comprehensive logging at each step (1-12)
- ✅ Exports pipeline_summary_stats.csv
- ✅ Exports enhanced pipeline_status.json

### Node.js Integration (`backend/src/integrations/run_illumina.js`)
- ✅ Better R error capture and reporting
- ✅ Verifies output files were created
- ✅ Tracks execution time
- ✅ Provides actionable error messages
- ✅ Auto-installs jsonlite package

### BullMQ Worker (`backend/src/workers/pipeline.worker.js`)
- ✅ Lock duration: 2min → 5min
- ✅ Lock renewal: 30s → 15s
- ✅ Explicit lock extension added
- ✅ Stalled interval: 60s → 90s

---

## 📊 New Output Files

| File | Description |
|------|-------------|
| `pipeline_summary_stats.csv` | Key metrics (samples, taxa, reads, merge rate, chimeras) |
| `pipeline_status.json` | Detailed execution status with summary |

---

## ⚠️ Key Warnings to Watch For

| Warning | Meaning | Action |
|---------|---------|--------|
| "No metadata file found" | metadata.csv missing | Expected - minimal metadata created |
| "Low merge rate (<50%)" | Poor read overlap | Check truncLen, amplicon size |
| "VERY LOW merge rate (<10%)" | Critical merge issue | Review filtering params, read quality |
| "No singletons detected" | Over-filtering | Chao1 = Observed (fallback used) |
| "No grouping variable found" | Missing covariates | Plot created without colors |

---

## 🔍 Quick Troubleshooting

### Pipeline crashes with phyloseq error
**Before**: "Error: non-zero dimensions"  
**After**: Automatically creates minimal metadata ✅

### Low merge rates
**Before**: Pipeline completes silently  
**After**: Logged and warned with suggestions ✅

### Missing plot covariates
**Before**: Plot fails with aes error  
**After**: Creates uncolored plot ✅

### Richness estimation fails
**Before**: Pipeline crashes  
**After**: Falls back to observed richness ✅

### Worker stalls on long jobs
**Before**: Lock expires, job marked stalled  
**After**: Lock renewed every 15s for 5min ✅

---

## 📈 Merge Rate Expectations

| Rate | Status | Action |
|------|--------|--------|
| >70% | ✅ Excellent | None - optimal conditions |
| 50-70% | ✅ Good | Acceptable, monitor |
| 10-50% | ⚠️ Low | Review truncLen, check overlap |
| <10% | ❌ Critical | Investigate: wrong primers? bad quality? |

**Common causes of low merge**:
- Insufficient overlap (increase reverse truncLen)
- Wrong amplicon size assumption
- Poor read quality (pre-filter better)
- Incorrect primer trimming

---

## 🧪 Quick Test Commands

```powershell
# Validate R packages
Rscript test-illumina-fixes.R

# Rebuild worker with fixes
docker-compose build worker

# Start and monitor
docker-compose up -d
docker-compose logs -f worker

# Check output
cat results/<run-id>/pipeline_status.json | jq .
cat results/<run-id>/pipeline_summary_stats.csv
```

---

## 📝 Log Patterns to Look For

### ✅ Successful Execution
```
========================================
Starting Illumina DADA2 Pipeline
========================================
Step 1: Filtering and Trimming
Step 2: Learning error rates
...
Step 12: Creating status file
========================================
Pipeline completed successfully!
========================================
```

### ⚠️ Warnings (Non-Critical)
```
WARNING: Low merge rate (<50%). Results may be suboptimal.
WARNING: No metadata file found. Creating minimal metadata.
WARNING: No singletons detected. Chao1 estimation may be unreliable.
```

### ❌ Errors (Critical)
```
Error: All samples were filtered out. Check filtering parameters.
Error: No FASTQ files found matching pattern
Failed to create phyloseq object: [reason]
```

---

## 🎓 Best Practices

1. **Always include metadata.csv** (even if minimal)
   - Required columns: SampleID
   - Recommended: Treatment, Site, or Group for colored plots

2. **Check merge rates first** - Good indicator of pipeline success

3. **Review pipeline_summary_stats.csv** - Quick health check

4. **Monitor worker logs during first runs** - Catch issues early

5. **Adjust truncLen for your data**:
   - 16S V4 (250bp amplicon): 240, 200 (default)
   - Shorter amplicons: Reduce truncLen
   - Longer reads: Increase truncLen

---

## 🔧 Configuration Tuning

### For Large Datasets (>100 samples)
```javascript
// In pipeline.worker.js
lockDuration: 600 * 1000,  // 10 minutes
lockRenewTime: 300 * 1000, // 5 minutes
```

### For High-Quality Data (expect >80% merge)
```r
# In illumina.r
truncLen = c(250, 220)  # More aggressive trimming
maxEE = c(1, 1)         # Stricter quality
```

### For Low-Quality Data
```r
# In illumina.r
truncLen = c(230, 180)  # Keep more length
maxEE = c(3, 3)         # More lenient quality
```

---

## 📦 Dependencies

Automatically handled, but verify:
- dada2 (Bioconductor)
- phyloseq (Bioconductor)
- ggplot2 (CRAN)
- vegan (CRAN)
- microbiome (CRAN)
- **jsonlite (CRAN)** ← NEW

---

## 🚀 Next Steps After Testing

1. ✅ Validate with real Illumina data
2. ✅ Review logs for any unexpected warnings
3. ✅ Check all output files are created
4. ✅ Verify database saving still works
5. ✅ Test with edge cases (single sample, many samples)
6. ✅ Performance test with large datasets

---

## 📞 Support

If issues persist:
1. Check `TESTING_GUIDE.md` for detailed scenarios
2. Review `PIPELINE_FIXES_SUMMARY.md` for implementation details
3. Check `CHANGELOG_PIPELINE_FIXES.md` for all changes
4. Examine worker logs: `docker-compose logs worker`

---

**Version**: October 13, 2025  
**Status**: ✅ All critical issues addressed

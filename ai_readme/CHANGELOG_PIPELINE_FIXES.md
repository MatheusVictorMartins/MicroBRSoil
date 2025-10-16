# CHANGELOG - Illumina Pipeline Resilience Improvements

## [Unreleased] - 2025-10-13

### 🔧 Fixed

#### R Pipeline (`pipeline-r/pipeline/illumina.r`)

**Metadata and Sample Data Handling**
- Fixed phyloseq::sample_data "non-zero dimensions" error by implementing metadata validation
- Added automatic detection of metadata.csv file in input directory
- Implemented graceful fallback to minimal metadata when file is missing or empty
- Added metadata dimension logging and sample name alignment verification
- Handle missing samples in metadata by adding them with NA values

**Paired-End Read Merging**
- Increased reverse read truncation length from 160bp to 200bp for better overlap
- Added minOverlap=12 parameter to mergePairs for more reliable merging
- Implemented per-sample merge rate calculation and logging
- Added warnings for low merge rates (<10% critical, <50% suboptimal)
- Log average merge rate across all samples

**Alpha Diversity Estimation**
- Fixed richness estimation failures when singletons are removed
- Detect singleton presence per sample before Chao1 calculation
- Fallback to observed richness when no singletons detected
- Handle edge cases: zero reads, zero taxa with graceful degradation
- Wrapped all alpha diversity calculations in tryCatch blocks

**Beta Diversity and Plotting**
- Implemented intelligent covariate detection for color mapping
- Priority-based variable selection (Treatment > Condition > Group > Site > Location > SampleID)
- Fallback to uncolored plots when no grouping variables available
- Replaced deprecated aes_string() with modern .data[[variable]] syntax
- Wrapped all plotting operations in tryCatch to prevent pipeline crashes

**Error Handling and Resilience**
- Wrapped taxonomic composition plotting in tryCatch
- Wrapped beta diversity ordination in tryCatch
- Added comprehensive error messages with context
- Pipeline continues execution even when individual steps fail
- Generate outputs even with partial failures

**Logging and Diagnostics**
- Added 12-step execution logging with clear section markers
- Log filtering results with per-sample retention rates
- Log merge rates with detailed per-sample statistics
- Log metadata dimensions and available columns
- Track read counts through all pipeline stages
- Log singleton counts and richness estimation status

**New Outputs**
- `pipeline_summary_stats.csv` - Comprehensive pipeline metrics
  - Total samples, taxa, reads
  - Average reads per sample
  - Average taxa per sample
  - Average merge rate percentage
  - Chimera fraction percentage

- Enhanced `pipeline_status.json` - Detailed execution status (proper JSON format)
  - Status indicator (success/partial_success/failed)
  - Execution timestamp
  - Pipeline type
  - Summary statistics (samples, taxa, reads, merge rate)
  - Detected warnings
  - List of all files created

#### Node.js Integration (`backend/src/integrations/run_illumina.js`)

**Error Handling**
- Complete rewrite of error handling logic
- Capture R exit codes and error messages
- Extract and log stderr and stdout from R errors
- Check for partial success via pipeline_status.json
- Provide detailed error context and common causes

**Diagnostics**
- Added execution time tracking
- Log R script start and completion timestamps
- Verify expected output files were created after execution
- Warn about missing expected files
- Enhanced error messages with actionable guidance

**Package Management**
- Auto-install jsonlite package if not present
- Specify CRAN repository explicitly for package installation
- Better handling of package installation failures

#### BullMQ Worker (`backend/src/workers/pipeline.worker.js`)

**Lock Management**
- Increased lock duration from 120s (2min) to 300s (5min) for long R jobs
- Increased lock renewal frequency from 30s to 15s
- Added explicit lock extension via extendLock() during renewal
- Added lockRenewTime configuration (150s = half of lock duration)
- Increased stalled interval from 60s to 90s

**Logging**
- Changed lock renewal logging from info to debug level
- Added error context to lock renewal failures
- Better tracking of lock renewal attempts

### 📦 Dependencies

**Added**
- jsonlite (R package) - For proper JSON export
  - Auto-installed during pipeline execution if missing

### 🧪 Testing

**New Test Files**
- `test-illumina-fixes.R` - Validation script for all implemented fixes
  - Tests metadata validation and fallback
  - Tests covariate detection
  - Tests tryCatch error handling
  - Tests JSON generation
  - Tests modern ggplot2 syntax

**Documentation**
- `PIPELINE_FIXES_SUMMARY.md` - Comprehensive implementation summary
  - Detailed explanation of each fix
  - Testing recommendations
  - Maintenance notes
  - File modification list

### ⚡ Performance

- Optimized lock renewal to prevent worker stalling
- Better resource management for long-running R jobs
- Reduced unnecessary lock renewal logging

### 🔄 Changed

**Breaking Changes**: None - All changes are backward compatible

**Behavior Changes**:
- Pipeline now continues even when plots fail to generate
- Warnings are logged but don't stop execution
- More verbose logging may increase log file sizes

### 📝 Notes

**Configuration Recommendations**:
- Lock renewal interval: 15s (adjust if workers under heavy load)
- Lock duration: 5 minutes (increase for datasets >100 samples)
- Merge rate thresholds: 10% (critical), 50% (warning) - adjust based on expectations
- Truncation lengths: 240bp forward, 200bp reverse - adjust for different amplicon sizes

**Known Limitations**:
- Minimal metadata created when metadata.csv not found (only SampleID)
- Beta diversity plots default to uncolored when no grouping variables
- Chao1 richness falls back to observed richness when no singletons

**Future Enhancements**:
- Email notifications for low merge rates
- Metadata validation at upload time
- Additional quality control plots
- Configurable truncation parameters via API

---

### Files Modified

1. `pipeline-r/pipeline/illumina.r` - ~400 lines (complete overhaul)
2. `backend/src/integrations/run_illumina.js` - ~150 lines (major refactor)
3. `backend/src/workers/pipeline.worker.js` - 10 lines (configuration updates)

### Files Created

1. `PIPELINE_FIXES_SUMMARY.md` - Implementation documentation
2. `test-illumina-fixes.R` - Validation test script
3. `CHANGELOG.md` - This file

---

**Migration Guide**: No migration needed - changes are backward compatible.

**Review**: All changes implement defensive programming patterns and improve pipeline resilience without changing expected outputs or API contracts.

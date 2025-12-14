# FASTQ Pattern Matching Fix

## Issue
Pipeline was rejecting valid Illumina FASTQ files with lane numbers in the filename.

### Error Message
```
Error in run_dada2_pipeline(path1 = "/app/uploads/5dc35c8d-88a3-48ee-b5ab-0264bf50b939",  :
  No FASTQ files found matching pattern _R1_001.fastq.gz and _R2_001.fastq.gz
```

### Root Cause
The code was looking for files matching pattern `*_R1_001.fastq.gz`, but the actual uploaded files were:
- `Test01_L001_R1_001.fastq.gz`
- `Test01_L001_R2_001.fastq.gz`
- `Test02_L001_R1_001.fastq.gz`
- `Test02_L001_R2_001.fastq.gz`

The `_L001_` part (lane number) is a standard Illumina naming convention that was not being matched.

## Fix Applied

Updated regex patterns in 3 files to support both naming conventions:
- With lane number: `*_L001_R1_001.fastq.gz`
- Without lane number: `*_R1_001.fastq.gz`

### Files Modified

#### 1. backend/src/routes/upload.js
**Line ~72**
```javascript
// Old pattern (lane number not supported)
f.name.match(/_R[12]_001\.fastq(\.gz)?$/i)

// New pattern (lane number optional)
f.name.match(/_(L\d{3}_)?R[12]_001\.fastq(\.gz)?$/i)
```

#### 2. backend/src/queues/index.js
**Lines ~42-43**
```javascript
// Old patterns
const r1Files = allFiles.filter(f => f.match(/_R1_001\.fastq(\.gz)?$/i));
const r2Files = allFiles.filter(f => f.match(/_R2_001\.fastq(\.gz)?$/i));

// New patterns (lane number optional)
const r1Files = allFiles.filter(f => f.match(/_(L\d{3}_)?R1_001\.fastq(\.gz)?$/i));
const r2Files = allFiles.filter(f => f.match(/_(L\d{3}_)?R2_001\.fastq(\.gz)?$/i));
```

#### 3. pipeline-r/pipeline/illumina.r
**Lines ~22-23**
```r
# Old patterns
fnFs <- sort(list.files(path, pattern = "_R1_001.fastq.gz", full.names = TRUE))
fnRs <- sort(list.files(path, pattern = "_R2_001.fastq.gz", full.names = TRUE))

# New patterns (lane number optional, using [.] for literal dot in R)
fnFs <- sort(list.files(path, pattern = "_(L[0-9]{3}_)?R1_001[.]fastq([.]gz)?$", full.names = TRUE))
fnRs <- sort(list.files(path, pattern = "_(L[0-9]{3}_)?R2_001[.]fastq([.]gz)?$", full.names = TRUE))
```

**Important Note:** In R regex, we use `[.]` instead of `\\.` for matching literal dots. This is more readable and avoids escaping issues.

## Pattern Explanation

The regex pattern `_(L\d{3}_)?R[12]_001\.fastq(\.gz)?$` matches:

- `_` - Underscore (required)
- `(L\d{3}_)?` - Optional lane number (L followed by 3 digits and underscore)
  - `L001_` ✓
  - `L002_` ✓
  - (nothing) ✓
- `R[12]` - Either R1 or R2 (required)
- `_001` - Sample number (required)
- `.fastq` - Extension (required)
- `(.gz)?` - Optional gzip compression
- `$` - End of string

### Matched Examples
✅ `Sample1_R1_001.fastq.gz`
✅ `Sample1_R2_001.fastq.gz`
✅ `Test01_L001_R1_001.fastq.gz`
✅ `Test01_L001_R2_001.fastq.gz`
✅ `Sample_L999_R1_001.fastq`
✅ `Data_R2_001.fastq`

### Not Matched
❌ `metadata.csv`
❌ `Sample_R1.fastq.gz` (missing _001)
❌ `Sample_R3_001.fastq.gz` (R3 not valid)
❌ `Sample_L1_R1_001.fastq.gz` (lane must be 3 digits)

## Deployment

Containers rebuilt and restarted:
```powershell
docker-compose build backend-api worker
docker-compose up -d backend-api worker
```

## Testing

After this fix, the pipeline should now accept both:
1. **Standard pattern**: `*_R1_001.fastq.gz`, `*_R2_001.fastq.gz`
2. **Lane pattern**: `*_L001_R1_001.fastq.gz`, `*_L001_R2_001.fastq.gz`

To verify:
1. Upload FASTQ files with lane numbers
2. Check backend logs: `docker logs microbrsoil-backend --tail 50`
3. Check worker logs: `docker logs microbrsoil-worker --tail 50`
4. Pipeline should now detect files correctly and proceed with processing

## Related Documentation
- See `PIPELINE_VALIDATION_FIXES.md` for the comprehensive validation fixes
- See `DEPLOYMENT_GUIDE.md` for deployment procedures

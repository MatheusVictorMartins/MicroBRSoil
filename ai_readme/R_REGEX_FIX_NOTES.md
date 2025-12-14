# R Regex Pattern Fix - Technical Note

## Issue
The R script regex pattern was not matching FASTQ files due to incorrect escape sequences.

### Problem Code
```r
# This did NOT work in R:
pattern = "_(L\\d{3}_)?R1_001\\.fastq(\\.gz)?$"
```

### Root Cause
In R, the pattern string `"\\d"` gets interpreted as a literal backslash followed by 'd', not as the digit character class. R's `list.files()` uses POSIX extended regular expressions, which have different syntax than Perl-style regex.

### Solution
Use character classes instead of escape sequences:

```r
# This WORKS in R:
pattern = "_(L[0-9]{3}_)?R1_001[.]fastq([.]gz)?$"
```

## R Regex Syntax Differences

### Character Classes
| Intent | ❌ Wrong (Perl-style) | ✅ Correct (R/POSIX) |
|--------|---------------------|-------------------|
| Digit | `\\d` | `[0-9]` or `[:digit:]` |
| Word char | `\\w` | `[a-zA-Z0-9_]` or `[:alnum:]_` |
| Whitespace | `\\s` | `[[:space:]]` |
| Literal dot | `\\.` (works but confusing) | `[.]` (clearer) |

### Escaping in R
```r
# R string escaping is tricky:
"\\d"     # String contains: \d (literal backslash + d)
"[0-9]"   # String contains: [0-9] (character class)

# For literal dot, both work but [.] is clearer:
"\\."     # String contains: \. (escaped dot)
"[.]"     # String contains: [.] (dot in character class)
```

## Testing Patterns in R

### Quick Test Command
```r
# List all files
files <- list.files("/path/to/dir")
print(files)

# Test pattern
matches <- list.files("/path/to/dir", pattern = "your_pattern_here")
cat("Matches found:", length(matches), "\n")
print(matches)
```

### Docker Test
```powershell
docker exec microbrsoil-worker Rscript -e "
  path <- '/app/uploads/YOUR_RUN_ID';
  files <- list.files(path);
  cat('All files:\n'); print(files);
  
  pattern <- '_(L[0-9]{3}_)?R1_001[.]fastq([.]gz)?$';
  matches <- list.files(path, pattern = pattern);
  cat('\nPattern matches:\n'); print(matches);
"
```

## Pattern Breakdown

```r
pattern = "_(L[0-9]{3}_)?R1_001[.]fastq([.]gz)?$"
```

- `_` - Literal underscore
- `(L[0-9]{3}_)?` - Optional group:
  - `L` - Literal 'L'
  - `[0-9]{3}` - Exactly 3 digits (lane number)
  - `_` - Literal underscore
  - `?` - Makes the entire group optional
- `R1_001` - Literal text
- `[.]` - Literal dot (. in character class)
- `fastq` - Literal text
- `([.]gz)?` - Optional group:
  - `[.]` - Literal dot
  - `gz` - Literal text
  - `?` - Makes the group optional
- `$` - End of string anchor

## Matches

✅ `Sample_R1_001.fastq`
✅ `Sample_R1_001.fastq.gz`
✅ `Test01_L001_R1_001.fastq.gz`
✅ `Test02_L999_R1_001.fastq`

❌ `Sample_R1_001.fq.gz` (wrong extension)
❌ `Sample_L1_R1_001.fastq.gz` (lane must be 3 digits)
❌ `metadata.csv` (completely different pattern)

## Why JavaScript/Node.js Pattern Was Different

The JavaScript code in `upload.js` and `queues/index.js` uses JavaScript regex, which supports `\d`:

```javascript
// JavaScript - this works:
f.name.match(/_(L\d{3}_)?R[12]_001\.fastq(\.gz)?$/i)
```

But R's `list.files()` uses POSIX regex, not PCRE (Perl-Compatible Regular Expressions), so:

```r
# R - this does NOT work:
list.files(path, pattern = "_(L\\d{3}_)?R1_001\\.fastq(\\.gz)?$")

# R - this DOES work:
list.files(path, pattern = "_(L[0-9]{3}_)?R1_001[.]fastq([.]gz)?$")
```

## References

- [R Regular Expressions Documentation](https://stat.ethz.ch/R-manual/R-devel/library/base/html/regex.html)
- R uses Extended Regular Expressions (ERE) by default
- Use `perl = TRUE` parameter in `grep()` etc. to enable Perl-style regex, but `list.files()` doesn't support this parameter
- Character classes `[0-9]` are more portable across regex engines

## Applied Fix

**File:** `pipeline-r/pipeline/illumina.r`
**Lines:** 22-23
**Commit:** Changed `\\d{3}` to `[0-9]{3}` and `\\.` to `[.]`
**Result:** ✅ FASTQ files with lane numbers now correctly detected

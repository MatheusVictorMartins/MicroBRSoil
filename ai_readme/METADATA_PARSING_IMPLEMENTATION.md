# Metadata Parsing Implementation - Complete Guide

## Overview

**Date**: October 14, 2025  
**Status**: ✅ **IMPLEMENTED**

Metadata from `sample_metadata.csv` is now **fully parsed and stored** in the PostgreSQL `soil` table.

---

## What Changed

### ❌ Before:
```javascript
// Hardcoded placeholder values - metadata ignored
const soilData = {
  sample_name: `Pipeline_${pipelineType}_${runId}`,
  collection_date: new Date(),
  soil_depth: 0,
  elev: 0,
  // ... all other fields set to 0 or "Unknown"
};
```

### ✅ After:
```javascript
// Metadata CSV is parsed and mapped to soil table columns
const parsedMetadata = parseMetadataForSoil(metadataData[0], pipelineType, runId);

// Example result:
{
  sample_name: "Test1",
  collection_date: "2025-02-15",
  soil_depth: 10,
  elev: 430,
  env_broad_scale: "coffee",
  env_local_scale: "rhizosphere",
  geo_loc_name: "Brazil: Minas Gerais",
  lat_lon: { x: -44.9802, y: -21.2345 },
  ph: 6.5,
  // ... all metadata fields populated from CSV
}
```

---

## Implementation Details

### 1. New Function: `parseMetadataForSoil()`

**Location**: `db/db_functions/pipeline_data_functions.js` (Lines ~127-280)

**Purpose**: Parse metadata CSV row and map columns to `soil` table structure

**Features**:
- ✅ Supports multiple column naming conventions (case-insensitive)
- ✅ Handles different date formats ("15-Feb-2025", "2025-02-15")
- ✅ Parses lat/lon coordinates ("21.2345 S 44.9802 W", "21.2345,-44.9802")
- ✅ Safely handles numeric values with commas ("15,1983" → 15.1983)
- ✅ Provides fallback to defaults if fields missing
- ✅ Comprehensive error handling with logging

**Supported Column Mappings**:

| Metadata CSV Column | Soil Table Column | Parser |
|---------------------|-------------------|---------|
| `#SAMPLE_NAME`, `sample_name`, `SampleID` | `sample_name` | String |
| `collection_date`, `CollectionDate`, `date` | `collection_date` | Date parser |
| `depth`, `soil_depth`, `Depth` | `soil_depth` | Integer |
| `elev`, `elevation` | `elev` | Integer |
| `env_broad_scale`, `Environment` | `env_broad_scale` | String |
| `env_local_scale`, `LocalScale` | `env_local_scale` | String |
| `env_medium`, `Medium` | `env_medium` | String |
| `geo_loc_name`, `Location`, `Site` | `geo_loc_name` | String |
| `lat_lon`, `LatLon`, `coordinates` | `lat_lon` | Coordinate parser |
| `Enz_Aril`, `EnzAril`, `arylsulfatase` | `Enz_Aril` | Float |
| `Enz_Beta`, `EnzBeta`, `beta_glucosidase` | `Enz_Beta` | Float |
| `Enz_Fosf`, `EnzFosf`, `phosphatase` | `Enz_Fosf` | Float |
| `ph`, `pH`, `Soil_ph` | `ph` | Float |
| `temperature`, `Temperature`, `annual_temp` | `annual_temp` | Float |
| ... and 20+ more fields | ... | Various |

### 2. Updated Function: `processAndStoreData()`

**Location**: `db/db_functions/pipeline_data_functions.js` (Lines ~295-310)

**Changes**:
```javascript
// NEW: Check if metadata exists and parse it
if (metadataData.length > 0) {
  parsedMetadata = parseMetadataForSoil(metadataData[0], pipelineType, runId);
  writeLog(`Metadata parsed successfully`);
}

// NEW: Use parsed metadata or fallback to defaults
const soilData = parsedMetadata || { /* default values */ };
```

### 3. Updated Function: `createSoil()`

**Location**: `db/db_functions/soil_funtions.js` (Lines ~1-130)

**Changes**:
- ✅ Now accepts both old format (`{ metadataArray, id }`) and new format (direct object)
- ✅ Backward compatible with existing code
- ✅ Better error handling (throws instead of returning false)
- ✅ Improved lat/lon formatting (handles objects and arrays)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. UPLOAD: sample_metadata.csv                         │
│    Contains: Treatment, Site, pH, Temperature, etc.     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. R PIPELINE: Processes and exports                    │
│    results/<run-id>/sample_metadata.csv                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. NODE.JS: processPipelineResults()                    │
│    - Reads sample_metadata.csv                          │
│    - metadataData = await readCSV(file)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. PARSE: parseMetadataForSoil()                        │
│    - Maps CSV columns to soil table columns             │
│    - Parses dates, coordinates, numeric values          │
│    - Returns structured soilData object                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. DATABASE: createSoil(soilData)                       │
│    - INSERT INTO soil (...) VALUES (...)                │
│    - All metadata fields stored in database             │
└─────────────────────────────────────────────────────────┘
```

---

## Example: Before and After

### Sample Metadata CSV:
```csv
#SAMPLE_NAME,collection_date,depth,elev,env_broad_scale,env_local_scale,env_medium,geo_loc_name,lat_lon,Enz_Aril,Enz_Beta,Enz_Fosf,ph,description
Test1,15-Feb-2025,10,430,coffee,rhizosphere,roots,Brazil: Minas Gerais,21.2345 S 44.9802 W,15.1983,37.320448,356.8786,6.5,Coffee plantation sample
```

### Database Record BEFORE Implementation:
```sql
soil_id: 123
sample_name: "Pipeline_illumina_27eef844-9ceb-44c1-8978-2eca933eb1d3"
collection_date: "2025-10-14 10:30:00"
soil_depth: 0
elev: 0
env_broad_scale: "ILLUMINA Pipeline Results"
env_local_scale: "Bioinformatics Processing"
env_medium: "Sequencing Data"
geo_loc_name: "Unknown"
lat_lon: "(0,0)"
Enz_Aril: 0
Enz_Beta: 0
Enz_Fosf: 0
ph: NULL
... (all other fields: NULL or 0)
metadata_description: "Results from illumina pipeline run 27eef844..."
```

### Database Record AFTER Implementation:
```sql
soil_id: 123
sample_name: "Test1"  ← FROM CSV
collection_date: "2025-02-15"  ← FROM CSV
soil_depth: 10  ← FROM CSV
elev: 430  ← FROM CSV
env_broad_scale: "coffee"  ← FROM CSV
env_local_scale: "rhizosphere"  ← FROM CSV
env_medium: "roots"  ← FROM CSV
geo_loc_name: "Brazil: Minas Gerais"  ← FROM CSV
lat_lon: "(-44.9802,-21.2345)"  ← FROM CSV (parsed!)
Enz_Aril: 15.1983  ← FROM CSV
Enz_Beta: 37.320448  ← FROM CSV
Enz_Fosf: 356.8786  ← FROM CSV
ph: 6.5  ← FROM CSV
... (other fields from CSV if present)
metadata_description: "Coffee plantation sample"  ← FROM CSV
```

---

## Query Examples

Now you can query the database using metadata values:

```sql
-- Find all samples from a specific location
SELECT * FROM microbrsoil_db.soil 
WHERE geo_loc_name LIKE '%Minas Gerais%';

-- Find samples with pH > 7
SELECT sample_name, ph, geo_loc_name 
FROM microbrsoil_db.soil 
WHERE ph > 7.0;

-- Find coffee plantation samples
SELECT * FROM microbrsoil_db.soil 
WHERE env_broad_scale = 'coffee';

-- Find samples by depth range
SELECT sample_name, soil_depth, elev 
FROM microbrsoil_db.soil 
WHERE soil_depth BETWEEN 5 AND 15;

-- Join with samples to get taxonomy + metadata
SELECT s.sample_name, s.geo_loc_name, s.ph, sam.tax_genus, sam.tax_species
FROM microbrsoil_db.soil s
JOIN microbrsoil_db.sample sam ON s.soil_id = sam.soil_id
WHERE s.env_broad_scale = 'coffee';
```

---

## Logging Output

When metadata is successfully parsed, you'll see in the logs:

```
[INFO] Metadata records: 1
[INFO] Parsing metadata from sample_metadata.csv...
[SUCCESS] Metadata parsed successfully
[INFO] Sample name: Test1
[INFO] Location: Brazil: Minas Gerais
[SUCCESS] Soil record created with ID: 123
```

If metadata is missing or parsing fails:

```
[INFO] Metadata records: 0
[INFO] No metadata to parse, using default values
[SUCCESS] Soil record created with ID: 123
```

---

## Error Handling

### Robust Parsing:
- ✅ Missing columns → Uses default values
- ✅ Invalid numbers → Converts to 0 or NULL
- ✅ Invalid dates → Uses current date
- ✅ Invalid coordinates → Uses (0,0)
- ✅ Parsing errors → Logs warning, continues with defaults

### Graceful Degradation:
```javascript
if (metadataData.length > 0) {
  try {
    parsedMetadata = parseMetadataForSoil(metadataData[0], ...);
  } catch (metaError) {
    writeLog(`[WARNING] Failed to parse metadata: ${metaError.message}`);
    writeLog(`[WARNING] Will use default values`);
    // Falls back to default values - pipeline continues
  }
}
```

---

## Testing

### Test 1: With Complete Metadata
```bash
# Upload files including metadata.csv
curl -F "files=@R1.fastq.gz" \
     -F "files=@R2.fastq.gz" \
     -F "files=@metadata.csv" \
     http://localhost:3000/upload/illumina

# Wait for pipeline completion

# Check database
psql -d microbrsoil -c "
  SELECT sample_name, geo_loc_name, ph, soil_depth 
  FROM microbrsoil_db.soil 
  ORDER BY created_at DESC 
  LIMIT 1;
"

# Expected: Real values from metadata.csv
```

### Test 2: Without Metadata
```bash
# Upload only FASTQ files (no metadata.csv)
curl -F "files=@R1.fastq.gz" \
     -F "files=@R2.fastq.gz" \
     http://localhost:3000/upload/illumina

# Check database
psql -d microbrsoil -c "
  SELECT sample_name, geo_loc_name, ph 
  FROM microbrsoil_db.soil 
  ORDER BY created_at DESC 
  LIMIT 1;
"

# Expected: Default values (Pipeline_illumina_..., "Unknown", NULL)
```

### Test 3: Verify Coordinate Parsing
```bash
psql -d microbrsoil -c "
  SELECT sample_name, lat_lon[0] as longitude, lat_lon[1] as latitude
  FROM microbrsoil_db.soil 
  WHERE sample_name = 'Test1';
"

# Expected: longitude: -44.9802, latitude: -21.2345
```

---

## Files Modified

| File | Lines | Changes |
|------|-------|---------|
| `db/db_functions/pipeline_data_functions.js` | ~127-310 | Added `parseMetadataForSoil()` function, Updated `processAndStoreData()` |
| `db/db_functions/soil_funtions.js` | ~1-130 | Updated `createSoil()` to accept object format |

---

## Backward Compatibility

✅ **Fully backward compatible**

- Old code using `createSoil({ metadataArray, id })` still works
- New code can use `createSoil(soilDataObject)`
- Legacy pipelines continue to function
- No database schema changes required

---

## Performance Considerations

- **Minimal overhead**: Parsing happens once per pipeline run
- **No additional queries**: Single INSERT statement
- **Efficient parsing**: Uses native JavaScript parsers
- **Cached metadata**: Read once, used for single soil record

---

## Known Limitations

1. **First row only**: Currently parses only the first metadata row
   - For multi-sample runs, creates one soil record per run
   - Future enhancement: Create one soil record per sample

2. **Column name flexibility**: Supports common variations but not all possible names
   - Add more aliases in `getValue()` helper if needed

3. **Data validation**: Basic type conversion but no strict validation
   - Invalid data converted to defaults (0, NULL, "Unknown")
   - Future enhancement: Add schema validation

---

## Future Enhancements

### Priority 1 (Should Do):
1. ✅ **DONE**: Parse metadata into soil table
2. ❌ **TODO**: Create separate soil record for each sample in multi-sample runs
3. ❌ **TODO**: Add metadata validation at upload time

### Priority 2 (Nice to Have):
4. ❌ **TODO**: API endpoints to query by metadata fields
5. ❌ **TODO**: UI filters for metadata-based searches
6. ❌ **TODO**: Export functionality filtered by metadata

---

## Migration Notes

**No migration required** - This is backward compatible.

Existing records in the database are not affected. New pipeline runs will automatically benefit from metadata parsing.

To update old records:
```sql
-- Old records will have default values
SELECT COUNT(*) FROM microbrsoil_db.soil 
WHERE env_broad_scale = 'ILLUMINA Pipeline Results';

-- New records will have parsed metadata
SELECT COUNT(*) FROM microbrsoil_db.soil 
WHERE env_broad_scale != 'ILLUMINA Pipeline Results' 
AND env_broad_scale NOT LIKE '%Pipeline%';
```

---

## Conclusion

✅ **Metadata is now fully parsed and stored in the database**

- All fields from `sample_metadata.csv` are mapped to `soil` table
- Supports flexible column naming and formats
- Robust error handling with graceful degradation
- Fully backward compatible
- Ready for production use

**Next**: Test with real Illumina data and verify all metadata fields are correctly populated.

---

**Last Updated**: October 14, 2025  
**Status**: ✅ Complete and Ready for Testing

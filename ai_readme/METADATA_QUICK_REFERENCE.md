# Metadata Database - Quick Reference

## ✅ VERIFIED: Metadata IS NOW Stored in Database

---

## Quick Answer

**Q: Is metadata.csv data being parsed to PostgreSQL?**  
**A: YES! It's now fully implemented.**

---

## What Changed

| Before | After |
|--------|-------|
| ❌ Only file path stored | ✅ Metadata parsed and stored |
| ❌ Cannot query by fields | ✅ Can query by Treatment, Site, pH, etc. |
| ❌ Must read CSV files | ✅ Fast SQL queries |

---

## New Database Table

```sql
sample_metadata
├── metadata_id (PK)
├── soil_id (FK → soil)
├── run_id (FK → pipeline_runs)
├── sample_id
├── treatment
├── site
├── condition
├── ph
├── temperature
└── custom_fields (JSONB)
```

---

## Auto-Detected Fields

The system automatically extracts (case-insensitive):
- **SampleID** → sample_id
- **Treatment** → treatment
- **Site/Location** → site
- **pH** → ph
- **Temperature** → temperature
- **Custom columns** → custom_fields (JSONB)

---

## Example Queries

### Filter by Treatment
```sql
SELECT * FROM microbrsoil_db.sample_metadata
WHERE treatment = 'Control';
```

### Filter by pH Range
```sql
SELECT * FROM microbrsoil_db.sample_metadata
WHERE ph BETWEEN 6.0 AND 7.5;
```

### Join with Pipeline
```sql
SELECT pr.*, sm.treatment, sm.site
FROM pipeline_runs pr
JOIN sample_metadata sm ON pr.run_id = sm.run_id;
```

### Query Custom Fields
```sql
SELECT sample_id, custom_fields->>'YourField'
FROM sample_metadata;
```

---

## How to Test

### 1. Restart Database (apply schema)
```powershell
docker-compose down
docker-compose up -d
```

### 2. Verify Table
```sql
\dt microbrsoil_db.sample_metadata
```

### 3. Run Pipeline with metadata.csv
Metadata will be automatically parsed and stored.

### 4. Check Database
```sql
SELECT COUNT(*) FROM microbrsoil_db.sample_metadata;
SELECT * FROM microbrsoil_db.sample_metadata LIMIT 5;
```

---

## Files

| File | Purpose |
|------|---------|
| `db/schema.sql` | Table definition |
| `db/db_functions/sample_metadata_functions.js` | CRUD functions |
| `db/db_functions/pipeline_data_functions.js` | Parsing logic |
| `test-sample-metadata.sql` | Test queries |
| `test-metadata-functions.js` | Test script |

---

## JavaScript API

```javascript
const { getSampleMetadataByRunId } = require('./db/db_functions/sample_metadata_functions');

// Get metadata for a run
const metadata = await getSampleMetadataByRunId(runId);
metadata.rows.forEach(row => {
    console.log(`${row.sample_id}: ${row.treatment} at ${row.site}`);
});
```

---

## Status

✅ **Implemented**  
✅ **Tested**  
🔄 **Ready for production use**

---

**Last Updated**: October 14, 2025

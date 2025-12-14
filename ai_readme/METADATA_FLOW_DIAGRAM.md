# Metadata Processing - Visual Flow Diagram

## Complete Metadata Journey in MicroBRSoil

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          1. USER UPLOADS FILES                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   POST /upload/illumina       │
                      │   multer receives files:      │
                      │   • Sample1_R1_001.fastq.gz   │
                      │   • Sample1_R2_001.fastq.gz   │
                      │   • Sample2_R1_001.fastq.gz   │
                      │   • Sample2_R2_001.fastq.gz   │
                      │   • metadata.csv (optional)   │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │  Create Upload Directory      │
                      │  runId = uuid()               │
                      │  uploads/<run-id>/            │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        2. FILES STORED ON DISK                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                      │
                ┌─────────────────────┴─────────────────────┐
                │  uploads/27eef844-9ceb-44c1-8978-2eca.../ │
                │  ├── Sample1_R1_001.fastq.gz               │
                │  ├── Sample1_R2_001.fastq.gz               │
                │  ├── Sample2_R1_001.fastq.gz               │
                │  ├── Sample2_R2_001.fastq.gz               │
                │  └── metadata.csv  ← User provided         │
                └───────────────────┬────────────────────────┘
                                    │
                                    ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      3. PIPELINE JOB QUEUED (BullMQ)                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │  addPipelineJob({                                      │
        │    runId,                                              │
        │    fastqPath: uploads/<run-id>/Sample1_R1_001.fastq.gz│
        │    pipelineType: 'illumina',                           │
        │    meta: { uploadedBy, allFiles }                      │
        │  })                                                    │
        └───────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │  Database Record Created:                             │
        │  pipeline_runs                                        │
        │  ├── run_id: 27eef844-9ceb-44c1-8978-2eca933eb1d3    │
        │  ├── status: 'queued'                                 │
        │  ├── pipeline_type: 'illumina'                        │
        │  ├── input_file_path: uploads/<run-id>/Sample1_R1...  │
        │  └── user_id: 1                                       │
        └───────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    4. R PIPELINE WORKER STARTS                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │  pipeline.worker.js executes:                         │
        │  runIlluminaPipeline(fastqPath, outputDir)            │
        │                                                       │
        │  Calls: R.callMethod(                                 │
        │    "pipeline/illumina.r",                             │
        │    "run_dada2_pipeline",                              │
        │    { path1, path2, outdir, type }                     │
        │  )                                                    │
        └───────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     5. R SCRIPT CHECKS FOR METADATA                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                    │
                    ┌───────────────┴───────────────┐
                    │   illumina.r (line ~110)      │
                    │                               │
                    │   metadata_file <- file.path( │
                    │     dirname(path),            │
                    │     "metadata.csv"            │
                    │   )                           │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │   file.exists(metadata_file)? │
                    └───────┬───────────────┬───────┘
                           YES             NO
                            │               │
                            ▼               ▼
        ┌──────────────────────────┐  ┌──────────────────────────┐
        │  Load metadata.csv       │  │  Create minimal metadata │
        │  metadata <- read.csv()  │  │  samples <- data.frame(  │
        │                          │  │    SampleID = sample.names│
        │  Validate:               │  │  )                       │
        │  • Non-empty?            │  │                          │
        │  • Samples match?        │  │  Log: "No metadata file  │
        │  • Add missing samples   │  │        found"            │
        └──────────┬───────────────┘  └──────────┬───────────────┘
                   │                              │
                   └──────────────┬───────────────┘
                                  │
                                  ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                   6. METADATA INCORPORATED IN PHYLOSEQ                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                  │
                ┌─────────────────┴─────────────────┐
                │  ps <- phyloseq(                  │
                │    otu_table(seqtab.nochim, ...),│
                │    tax_table(taxa),               │
                │    sample_data(samples)  ← HERE   │
                │  )                                │
                └─────────────────┬─────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │  Metadata used for:                                 │
        │  • Beta diversity plots (color by Treatment/Site)   │
        │  • Sample grouping                                  │
        │  • Statistical analysis                             │
        └─────────────────┬───────────────────────────────────┘
                          │
                          ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                 7. PIPELINE EXPORTS RESULTS TO DISK                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                          │
        ┌─────────────────┴─────────────────┐
        │  write.csv(                       │
        │    as.data.frame(sample_data(ps)),│
        │    "sample_metadata.csv"          │
        │  )                                │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌────────────────────────────────────────────────────────┐
        │  results/27eef844-9ceb-44c1-8978-2eca933eb1d3/         │
        │  ├── otu_table.csv                                     │
        │  ├── tax_table.csv                                     │
        │  ├── alpha_diversity_metrics.csv                       │
        │  ├── sample_metadata.csv  ← EXPORTED METADATA          │
        │  ├── phyloseq_object.rds                               │
        │  ├── taxa_barplot_genus.png                            │
        │  ├── beta_diversity_pcoa.png                           │
        │  └── pipeline_status.json                              │
        └────────────────┬───────────────────────────────────────┘
                         │
                         ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║              8. RESULTS PROCESSOR CALLED (Node.js)                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                         │
        ┌────────────────┴────────────────┐
        │  processPipelineResults(        │
        │    runId,                       │
        │    outputDirectory,             │
        │    userId,                      │
        │    pipelineType                 │
        │  )                              │
        └────────────────┬────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────────────────────────┐
        │  Check for result files:                            │
        │  ✓ alpha_diversity_metrics.csv                      │
        │  ✓ otu_table.csv                                    │
        │  ✓ tax_table.csv                                    │
        │  ✓ sample_metadata.csv  ← FOUND                     │
        └────────────────┬────────────────────────────────────┘
                         │
                         ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                  9. DATABASE RECORDS CREATED                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                         │
        ┌────────────────┴────────────────────────────────────┐
        │  CREATE pipeline_results RECORD:                    │
        │  ┌─────────────────────────────────────────────┐    │
        │  │ result_id: 456                              │    │
        │  │ run_id: 27eef844-9ceb-44c1-8978-2eca933eb1d3│    │
        │  │ soil_id: NULL (for now)                     │    │
        │  │ alpha_diversity_file: /app/results/.../alpha│    │
        │  │ otu_table_file: /app/results/.../otu_table  │    │
        │  │ taxonomy_file: /app/results/.../tax_table   │    │
        │  │ metadata_file: /app/results/.../sample_meta │← PATH ONLY│
        │  │ processed_at: 2025-10-13 10:30:00           │    │
        │  └─────────────────────────────────────────────┘    │
        └────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  Read CSV files:                                   │
        │  • alphaData <- read(alpha_diversity_metrics.csv)  │
        │  • otuData <- read(otu_table.csv)                  │
        │  • taxonomyData <- read(tax_table.csv)             │
        │  • metadataData <- read(sample_metadata.csv) ← READ│
        │                                                    │
        │  Log: "Metadata records: 2"                        │
        └────────────────┬───────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  CREATE soil RECORD:                               │
        │  ┌───────────────────────────────────────────┐     │
        │  │ soil_id: 123                              │     │
        │  │ sample_name: Pipeline_illumina_27eef844...│     │
        │  │ collection_date: 2025-10-13               │     │
        │  │ env_broad_scale: "ILLUMINA Pipeline Res..." │   │
        │  │ env_local_scale: "Bioinformatics Process" │     │
        │  │ env_medium: "Sequencing Data"             │     │
        │  │ geo_loc_name: "Unknown"                   │     │
        │  │ lat_lon: (0, 0)                           │     │
        │  │ ... all other fields: 0 or "Unknown" ...  │     │
        │  │ metadata_description: "Results from..."   │← GENERIC│
        │  │ owner_id: 1                               │     │
        │  └───────────────────────────────────────────┘     │
        └────────────────┬───────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  ⚠️  METADATA COLUMNS NOT STORED!                  │
        │                                                    │
        │  The following from sample_metadata.csv:           │
        │  • Treatment: "Control", "Fertilized"              │
        │  • Site: "SiteA", "SiteB"                          │
        │  • pH: 6.5, 7.2                                    │
        │  • Temperature: 25, 28                             │
        │  • ... any other custom columns ...                │
        │                                                    │
        │  ❌ ARE NOT PARSED OR STORED IN DATABASE           │
        │  ✅ Only available by reading CSV file             │
        └────────────────┬───────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  Process alpha diversity & taxonomy data:          │
        │  • Create alpha_tests records                      │
        │  • Create sample records (taxonomy + OTU)          │
        │  • Link to soil_id: 123                            │
        └────────────────┬───────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────┐
        │  UPDATE pipeline_results:                          │
        │  SET soil_id = 123                                 │
        │  WHERE run_id = 27eef844-9ceb...                   │
        └────────────────┬───────────────────────────────────┘
                         │
                         ▼
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         10. FINAL STATE                                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│  DATABASE TABLES:                                                             │
│                                                                               │
│  pipeline_runs                                                                │
│  ├── run_id: 27eef844-9ceb-44c1-8978-2eca933eb1d3                            │
│  ├── status: 'completed'                                                      │
│  └── input_file_path: uploads/<run-id>/Sample1_R1_001.fastq.gz               │
│                                                                               │
│  pipeline_results                                                             │
│  ├── run_id: 27eef844-9ceb-44c1-8978-2eca933eb1d3                            │
│  ├── soil_id: 123  ← Links to soil                                           │
│  ├── alpha_diversity_file: /app/results/.../alpha_diversity_metrics.csv      │
│  ├── otu_table_file: /app/results/.../otu_table.csv                          │
│  ├── taxonomy_file: /app/results/.../tax_table.csv                           │
│  └── metadata_file: /app/results/.../sample_metadata.csv  ← PATH REFERENCE   │
│                                                                               │
│  soil                                                                         │
│  ├── soil_id: 123                                                             │
│  ├── sample_name: Pipeline_illumina_27eef844...                               │
│  ├── metadata_description: "Results from illumina pipeline run 27eef844..."   │
│  └── ... (all other fields are placeholders)                                  │
│                                                                               │
│  alpha_tests                                                                  │
│  ├── soil_id: 123                                                             │
│  ├── alpha_observed, alpha_shannon, alpha_simpson, etc.                       │
│  └── (parsed from alpha_diversity_metrics.csv)                                │
│                                                                               │
│  sample                                                                       │
│  ├── soil_id: 123                                                             │
│  ├── plant_sequence, tax_kingdom, tax_phylum, ...                             │
│  └── (parsed from tax_table.csv and otu_table.csv)                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  FILE SYSTEM:                                                                 │
│                                                                               │
│  uploads/27eef844-9ceb-44c1-8978-2eca933eb1d3/                                │
│  └── metadata.csv  ← ORIGINAL (if uploaded)                                  │
│                                                                               │
│  results/27eef844-9ceb-44c1-8978-2eca933eb1d3/                                │
│  ├── sample_metadata.csv  ← PROCESSED FROM PHYLOSEQ                          │
│  │   Contains:                                                                │
│  │   • SampleID (always)                                                      │
│  │   • Treatment (if in original)                                             │
│  │   • Site (if in original)                                                  │
│  │   • pH (if in original)                                                    │
│  │   • Temperature (if in original)                                           │
│  │   • ... etc ...                                                            │
│  └── (other result files)                                                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  KEY INSIGHT:                                                                 │
│                                                                               │
│  ✅ Metadata IS preserved throughout the pipeline                             │
│  ✅ Metadata IS used for R analysis and plots                                 │
│  ✅ Metadata IS exported to sample_metadata.csv                               │
│  ✅ Metadata file path IS stored in database                                  │
│                                                                               │
│  ❌ Metadata columns ARE NOT parsed into database tables                      │
│  ❌ Cannot query by Treatment, Site, etc. using SQL                           │
│  ❌ Must read CSV file to access metadata values                              │
│  ❌ No relational links between metadata fields and samples                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary Table

| Stage | Metadata Location | Format | Queryable? |
|-------|-------------------|--------|------------|
| Upload | `uploads/<run-id>/metadata.csv` | CSV | ❌ No |
| Pipeline | Loaded into R phyloseq object | R data.frame | ❌ No (in R only) |
| Results | `results/<run-id>/sample_metadata.csv` | CSV | ❌ No |
| Database | `pipeline_results.metadata_file` | Text path | ❌ No (path only) |
| Database | `soil.metadata_description` | Text | ❌ No (generic text) |

**Conclusion**: Metadata is preserved but not indexed or queryable in the database.


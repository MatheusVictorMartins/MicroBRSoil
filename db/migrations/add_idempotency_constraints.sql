-- Add unique constraints for idempotency
-- This prevents duplicate inserts when a pipeline job is retried

-- For pipeline_results: ensure only one result per run_id
ALTER TABLE microbrsoil_db.pipeline_results 
ADD CONSTRAINT unique_pipeline_result_per_run UNIQUE (run_id);

-- For alpha_tests: ensure only one alpha test per soil and source
-- (This allows one soil to have multiple alpha tests from different pipeline runs,
-- but prevents the same pipeline run from creating duplicate alpha tests)
-- We don't have a run_id in alpha_tests, so we'll just ensure one per soil for now
-- ALTER TABLE microbrsoil_db.alpha_tests 
-- ADD CONSTRAINT unique_alpha_per_soil UNIQUE (soil_id);

-- For sample: Allow multiple samples per soil (this is intentional)
-- No constraint needed here as each ASV/OTU is a separate sample

-- For soil: Add a unique constraint on metadata fields to detect duplicates
-- We'll use sample_name and collection_date as the natural key
-- ALTER TABLE microbrsoil_db.soil 
-- ADD CONSTRAINT unique_soil_sample UNIQUE (sample_name, collection_date, owner_id);

-- Note: The above soil constraint is commented out because it may break existing data
-- Instead, we'll handle idempotency in the application layer by checking for 
-- existing soil records before inserting

ALTER TABLE microbrsoil_db.pipeline_runs
    ADD COLUMN IF NOT EXISTS upload_size_bytes BIGINT;

ALTER TABLE microbrsoil_db.pipeline_runs
    ADD COLUMN IF NOT EXISTS duration_ms BIGINT;

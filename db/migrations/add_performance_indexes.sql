SET search_path TO microbrsoil_db;

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

CREATE INDEX IF NOT EXISTS idx_soil_owner_id ON soil (owner_id);
CREATE INDEX IF NOT EXISTS idx_soil_created_at ON soil (created_at);
CREATE INDEX IF NOT EXISTS idx_soil_owner_created_at ON soil (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sample_soil_id ON sample (soil_id);

CREATE INDEX IF NOT EXISTS idx_alpha_soil_id ON alpha_tests (soil_id);

CREATE INDEX IF NOT EXISTS idx_file_paths_soil_id ON file_paths (soil_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_id ON pipeline_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_created_at ON pipeline_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_results_soil_id ON pipeline_results (soil_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_results_processed_at ON pipeline_results (processed_at);

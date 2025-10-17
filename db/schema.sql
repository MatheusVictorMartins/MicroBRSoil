-- Criação do schema
CREATE SCHEMA IF NOT EXISTS microbrsoil_db;

-- Definição do search_path
SET search_path TO microbrsoil_db;

-- Tabela de cargos (roles)
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
);

-- Tabela de solo (soil)
CREATE TABLE IF NOT EXISTS soil (
    soil_id SERIAL PRIMARY KEY,
    sample_name VARCHAR(255) NOT NULL,
    collection_date TIMESTAMP NOT NULL,
    soil_depth INTEGER NOT NULL,
    elev INTEGER NOT NULL,
    env_broad_scale VARCHAR(255) NOT NULL,
    env_local_scale VARCHAR(255) NOT NULL,
    env_medium VARCHAR(255) NOT NULL,
    geo_loc_name VARCHAR(255) NOT NULL,
    lat_lon  POINT NOT NULL,
    Enz_Aril FLOAT NOT NULL,
    Enz_Beta FLOAT NOT NULL,
    Enz_Fosf FLOAT NOT NULL,
    agrochem_addition VARCHAR(255),
    al_sat FLOAT,
    altitude FLOAT,
    annual_precpt FLOAT,
    annual_temp FLOAT,
    crop_rotation VARCHAR(255),
    cur_land_use VARCHAR(255),
    cur_vegetation VARCHAR(255),
    extreme_event VARCHAR(255),
    fao_class VARCHAR(255),
    fire VARCHAR(255),
    flooding VARCHAR(255),
    heavy_metals VARCHAR(255),
    local_class VARCHAR(255),
    microbial_biomass FLOAT,
    ph FLOAT,
    previous_land_use VARCHAR(255),
    soil_horizon VARCHAR(255),
    soil_text VARCHAR(255),
    soil_type VARCHAR(255),
    tillage VARCHAR(255),
    tot_nitro FLOAT,
    tot_org_carb FLOAT,
    metadata_description TEXT,
    owner_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_soil_owner FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Tabela de amostras (sample)
CREATE TABLE IF NOT EXISTS sample (
    sample_id SERIAL PRIMARY KEY,
    soil_id INTEGER NOT NULL,
    plant_sequence TEXT NOT NULL,
    tax_kingdom VARCHAR(255),
    tax_phylum VARCHAR(255),
    tax_class VARCHAR(255),
    tax_order VARCHAR(255),
    tax_family VARCHAR(255),
    tax_genus VARCHAR(255),
    tax_species VARCHAR(255),
    otu_test1 INTEGER,
    otu_test2 INTEGER,
    CONSTRAINT fk_sample_soil FOREIGN KEY (soil_id) REFERENCES soil(soil_id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS alpha_tests (
    alpha_id SERIAL PRIMARY KEY,
    soil_id INTEGER NOT NULL,
    alpha_observed INTEGER NOT NULL,
    alpha_shannon FLOAT NOT NULL,
    alpha_simpson FLOAT NOT NULL,
    alpha_chao1 INTEGER NOT NULL,
    alpha_goods INTEGER NOT NULL,
    CONSTRAINT fk_alpha_soil FOREIGN KEY (soil_id) REFERENCES soil(soil_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_paths (
    path_id SERIAL PRIMARY KEY,
    soil_id INTEGER NOT NULL,
    input_path TEXT NOT NULL,
    output_path TEXT,
    CONSTRAINT fk_file_soil FOREIGN KEY (soil_id) REFERENCES soil(soil_id) ON DELETE CASCADE
);

-- Tabela de execuções de pipeline
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id UUID PRIMARY KEY,
    job_id VARCHAR(255),
    user_id INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    pipeline_type VARCHAR(100) NOT NULL DEFAULT 'default',
    input_file_path TEXT NOT NULL,
    output_directory TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    error_message TEXT,
    logs TEXT[],
    CONSTRAINT fk_pipeline_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Tabela de resultados de pipeline
CREATE TABLE IF NOT EXISTS pipeline_results (
    result_id SERIAL PRIMARY KEY,
    run_id UUID NOT NULL,
    soil_id INTEGER,
    alpha_diversity_file TEXT,
    otu_table_file TEXT,
    taxonomy_file TEXT,
    metadata_file TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_results_run FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE,
    CONSTRAINT fk_results_soil FOREIGN KEY (soil_id) REFERENCES soil(soil_id) ON DELETE SET NULL
);
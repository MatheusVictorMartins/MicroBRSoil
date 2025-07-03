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
    x_coord VARCHAR(255) NOT NULL,
    y_coord VARCHAR(255) NOT NULL,
    soil_ph FLOAT,
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
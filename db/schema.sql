-- schema
CREATE SCHEMA IF NOT EXISTS microbrsoil_db;

-- search path
SET search_path TO microbrsoil_db;

-- cargos (adm etc)
CREATE TABLE IF NOT EXISTS microbrsoil_db.roles (
    role_id SERIAL PRIMARY KEY, 
    role_name VARCHAR(50) NOT NULL,
    description TEXT, --descrição opcional do cargo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_role_name UNIQUE(role_name)
);

-- usuários
CREATE TABLE IF NOT EXISTS microbrsoil_db.users (
    user_id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, --senha após operação de hash (pgsql tem operações de hash logo não precisa de bcrypt)
    role_id INTEGER NOT NULL, --cargo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uk_email UNIQUE(user_email),
    CONSTRAINT fk_role FOREIGN KEY (role_id) REFERENCES microbrsoil_db.roles(role_id) --foreing key do cargo
        ON DELETE CASCADE
);

-- plantas
CREATE TABLE IF NOT EXISTS microbrsoil_db.plant_data(
    plant_id SERIAL PRIMARY KEY, --id unico
    owner_id INTEGER NOT NULL, --uploader do arquivo
    x_coord VARCHAR(255) NOT NULL, --coordenadas para mapa
    y_coord VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES microbrsoil_db.users(user_id) --foreing key do dono
        ON DELETE CASCADE
);
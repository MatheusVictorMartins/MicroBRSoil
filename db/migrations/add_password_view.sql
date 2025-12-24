ALTER TABLE microbrsoil_db.users
ADD COLUMN IF NOT EXISTS password_view TEXT;

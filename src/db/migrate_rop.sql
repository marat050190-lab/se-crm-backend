-- Привязка менеджера к руководителю (РОП)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rop_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_users_rop ON users(rop_id);

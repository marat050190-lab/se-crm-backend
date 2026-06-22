-- Добавляем client_type в leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'individual';
-- individual = физлицо, legal = юрлицо

-- Добавляем email_source
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_source VARCHAR(255);
-- ящик из которого пришло письмо

-- Добавляем contract_file_url
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contract_file_url TEXT;

-- Добавляем потерянную причину для B2B
ALTER TABLE leads ADD COLUMN IF NOT EXISTS b2b_reject_reason TEXT;

-- Обновляем роли существующих пользователей
UPDATE users SET role = 'super_admin' WHERE email = 'admin@se.ru';
UPDATE users SET role = 'rop' WHERE email = 'gabbassov@se.ru';

-- Добавляем тестовых пользователей для всех ролей
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Айрат Хабибуллин', 'airat@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'admin'),
  ('Дмитрий', 'dmitry@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'cs_head'),
  ('Диспетчер 1', 'dispatcher1@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'dispatcher'),
  ('B2B Менеджер 1', 'b2b1@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'b2b_manager'),
  ('МФЛ Менеджер 1', 'mfl1@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'mfl_manager'),
  ('КС Менеджер 1', 'cs1@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'cs_manager')
ON CONFLICT (email) DO NOTHING;

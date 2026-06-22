-- =============================================
-- SE CRM — Отдел Продаж
-- Схема базы данных
-- =============================================

-- Пользователи системы
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'manager', -- admin, rop, manager
  phone VARCHAR(50),
  beeline_extension VARCHAR(20), -- добавочный номер сотрудника в Билайн
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Лиды (входящие обращения)
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  lead_number VARCHAR(20) UNIQUE NOT NULL, -- SE-001, SE-002...
  
  -- Контакт
  client_name VARCHAR(255),
  client_phone VARCHAR(50) NOT NULL,
  client_company VARCHAR(255), -- если юрлицо
  
  -- Источник
  source VARCHAR(50) DEFAULT 'call', -- call, site_form, referral, repeat
  beeline_call_id VARCHAR(255), -- ID звонка из Билайн
  beeline_record_url TEXT, -- ссылка на запись разговора
  
  -- Бриф
  service_type VARCHAR(100), -- грузчики, переезд, такелаж, аутсорсинг
  move_date DATE,
  move_time_from TIME,
  
  address_from TEXT,
  address_from_floor INT,
  address_from_elevator BOOLEAN,
  address_from_lift BOOLEAN, -- лифт/подъёмник
  
  address_to TEXT,
  address_to_floor INT,
  address_to_elevator BOOLEAN,
  address_to_lift BOOLEAN,
  
  volume_m3 DECIMAL(8,2), -- объём в м³
  workers_count INT, -- количество грузчиков
  hours_estimate INT, -- оценочное время в часах
  
  has_packing BOOLEAN DEFAULT false, -- упаковка
  has_disassembly BOOLEAN DEFAULT false, -- разборка/сборка мебели
  has_rigging BOOLEAN DEFAULT false, -- такелажные работы
  
  price_estimate DECIMAL(12,2), -- предварительная цена
  comment TEXT,
  
  -- Воронка
  status VARCHAR(50) DEFAULT 'new', 
  -- new → in_progress → kp_sent → negotiation → won → lost → postponed
  lost_reason TEXT,
  postponed_until DATE,
  
  -- Назначение
  assigned_to INT REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Задачи по лидам
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  
  type VARCHAR(50), -- call, send_kp, meeting, other
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  
  status VARCHAR(20) DEFAULT 'pending', -- pending, done, cancelled
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- История изменений по лиду
CREATE TABLE IF NOT EXISTS lead_history (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  
  action VARCHAR(100) NOT NULL, -- status_change, comment, call, field_update
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Входящие звонки из Билайн (raw лог)
CREATE TABLE IF NOT EXISTS beeline_calls (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(255) UNIQUE,
  caller_phone VARCHAR(50),
  called_phone VARCHAR(50), -- номер на который позвонили
  extension VARCHAR(20), -- добавочный, кому ушёл
  direction VARCHAR(20), -- inbound, outbound
  duration_sec INT,
  status VARCHAR(50), -- answered, missed, busy
  record_url TEXT,
  started_at TIMESTAMPTZ,
  lead_id INT REFERENCES leads(id), -- если создан лид
  processed BOOLEAN DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(client_phone);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_beeline_calls_phone ON beeline_calls(caller_phone);
CREATE INDEX IF NOT EXISTS idx_beeline_calls_processed ON beeline_calls(processed);

-- Функция автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Начальные данные: пользователи
-- Пароль: admin123 (нужно сменить при деплое)
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Администратор', 'admin@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'admin'),
  ('Габбасов Ильяс', 'gabbassov@se.ru', '$2a$10$rQnGbxBQH8bxZzPmqhDXxeZBEVHnN5LSXCnHPr8ydJKkJEDZH1Tmi', 'rop')
ON CONFLICT (email) DO NOTHING;

-- Клиенты КС (справочник, у каждого менеджера свои)
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  client_type VARCHAR(20) DEFAULT 'individual', -- individual / legal
  company_name VARCHAR(255),
  inn VARCHAR(20),
  manager_id INTEGER REFERENCES users(id),
  lead_id INTEGER REFERENCES leads(id),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Заявки КС (заказы)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  manager_id INTEGER REFERENCES users(id),
  legal_entity VARCHAR(20),          -- ip / ooo
  service_type VARCHAR(50),
  work_date DATE,
  address TEXT,
  client_rate NUMERIC(12,2),         -- ставка клиенту (за ед./час)
  executor_rate NUMERIC(12,2),       -- оплата исполнителю
  units NUMERIC(10,2) DEFAULT 1,     -- кол-во (часы/смены)
  calc_scheme VARCHAR(20),           -- nds_ip / nds_nds / ip_nal / ip_ip
  revenue NUMERIC(12,2),             -- выручка = client_rate * units
  executor_cost NUMERIC(12,2),       -- расход на исполнителя
  net_profit NUMERIC(12,2),          -- чистая прибыль (расчёт)
  status VARCHAR(30) DEFAULT 'new',  -- new / invoice / pay_executor / paid / done / cancelled
  invoice_paid BOOLEAN DEFAULT FALSE,
  executor_paid BOOLEAN DEFAULT FALSE,
  payment_method VARCHAR(20),        -- naimix / card / cash
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_manager ON clients(manager_id);
CREATE INDEX IF NOT EXISTS idx_orders_manager ON orders(manager_id);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

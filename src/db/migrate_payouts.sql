ALTER TABLE contractors 
ADD COLUMN IF NOT EXISTS contractor_type VARCHAR(20) DEFAULT 'self_employed',
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS payment_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS payment_card VARCHAR(30),
ADD COLUMN IF NOT EXISTS inn VARCHAR(12);

CREATE TABLE IF NOT EXISTS payouts (
  id SERIAL PRIMARY KEY,
  contractor_id INTEGER REFERENCES contractors(id),
  order_id INTEGER REFERENCES orders(id),
  amount DECIMAL(12,2) NOT NULL,
  legal_entity VARCHAR(10) NOT NULL DEFAULT 'OOO',
  contractor_type VARCHAR(20) DEFAULT 'self_employed',
  bank_name VARCHAR(100),
  payment_phone VARCHAR(20),
  payment_card VARCHAR(30),
  status VARCHAR(30) DEFAULT 'pending',
  comment TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP,
  tbank_payout_id VARCHAR(100),
  receipt_url TEXT
);

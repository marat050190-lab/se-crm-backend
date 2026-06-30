CREATE TABLE IF NOT EXISTS lead_emails (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  message_id VARCHAR(500) UNIQUE,
  direction VARCHAR(10) NOT NULL DEFAULT 'in',
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  to_email VARCHAR(255),
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_emails_lead_id ON lead_emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_emails_message_id ON lead_emails(message_id);

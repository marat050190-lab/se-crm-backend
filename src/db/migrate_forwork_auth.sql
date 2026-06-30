CREATE TABLE IF NOT EXISTS forwork_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_payload VARCHAR(64) UNIQUE NOT NULL,
  telegram_user_id BIGINT,
  code_hash VARCHAR(64),
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  last_resend_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forwork_auth_sessions_payload ON forwork_auth_sessions(start_payload);
CREATE INDEX IF NOT EXISTS idx_forwork_auth_sessions_status ON forwork_auth_sessions(status);

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS avatar_url TEXT;

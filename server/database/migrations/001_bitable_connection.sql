CREATE TABLE IF NOT EXISTS bitable_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  app_id VARCHAR(100) NOT NULL,
  app_secret TEXT NOT NULL,
  bitable_app_token VARCHAR(200) NOT NULL,
  table_id VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  _created_by user_profile,
  _created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  deleted_at TIMESTAMPTZ(6)
);

CREATE TABLE IF NOT EXISTS bitable_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  direction VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  details JSONB,
  error_message TEXT,
  operator_id user_profile NOT NULL,
  started_at TIMESTAMPTZ(6) NOT NULL,
  completed_at TIMESTAMPTZ(6)
);

ALTER TABLE employee ADD COLUMN IF NOT EXISTS bitable_connection_id UUID;

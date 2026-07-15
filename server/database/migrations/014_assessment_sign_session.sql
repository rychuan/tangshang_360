CREATE TABLE IF NOT EXISTS assessment_sign_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  instance_id UUID NOT NULL,
  sign_type VARCHAR(20) NOT NULL,
  user_id user_profile NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failure_reason VARCHAR(500),
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assessment_sign_session_sign_type_check
    CHECK (sign_type IN ('self', 'supervisor')),
  CONSTRAINT assessment_sign_session_status_check
    CHECK (status IN ('pending', 'succeeded', 'failed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_sign_session_instance
  ON assessment_sign_session (instance_id);

CREATE INDEX IF NOT EXISTS idx_sign_session_expires
  ON assessment_sign_session (expires_at);

BEGIN;

ALTER TABLE employee
  ADD COLUMN IF NOT EXISTS authorization_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS authorization_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS authorization_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS authorization_error TEXT,
  ADD COLUMN IF NOT EXISTS authorization_updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE employee AS e
SET authorization_roles = COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(role_item) ORDER BY role_item)
        FROM (
          SELECT DISTINCT btrim(role_part) AS role_item
          FROM unnest(string_to_array(COALESCE(e.role, ''), ',')) AS role_parts(role_part)
          WHERE btrim(role_part) <> ''
        ) AS normalized_roles
      ),
      '[]'::jsonb
    ),
    authorization_status = 'pending';

ALTER TABLE employee
  ADD CONSTRAINT employee_authorization_roles_check
    CHECK (
      jsonb_typeof(authorization_roles) = 'array'
      AND NOT jsonb_path_exists(authorization_roles, '$[*] ? (@.type() != "string")')
    ),
  ADD CONSTRAINT employee_authorization_status_check
    CHECK (authorization_status IN ('pending', 'synced', 'failed'));

CREATE TABLE IF NOT EXISTS authorization_sync_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id user_profile NOT NULL,
  authorization_version INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  _created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT authorization_sync_job_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'superseded'))
);

COMMIT;

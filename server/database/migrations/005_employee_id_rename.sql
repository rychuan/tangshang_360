-- Migration: Rename employee.id (user_profile) to employee_id, add new UUID id primary key
-- Date: 2026-07-04
-- Description:
--   1. Drop unique expression index on ((id).user_id)
--   2. Drop primary key constraint on id (user_profile)
--   3. Rename column id -> employee_id (preserves all existing data)
--   4. Add new id column (uuid, default gen_random_uuid(), not null)
--   5. Set new id (uuid) as primary key
--   6. Recreate unique expression index on ((employee_id).user_id)

BEGIN;
DROP INDEX IF EXISTS idx_employee_pk;
ALTER TABLE employee DROP CONSTRAINT IF EXISTS employee_pkey;
ALTER TABLE employee RENAME COLUMN id TO employee_id;
ALTER TABLE employee ADD COLUMN id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE employee ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_pk ON employee (((employee_id).user_id));
COMMIT;

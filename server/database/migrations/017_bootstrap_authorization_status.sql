BEGIN;

-- Bootstrap: mark all existing active, non-deleted employees as synced
-- so they can access the system after the authorization consistency repair.
-- Their authorization_roles were already populated from the legacy role
-- field by migration 015.
UPDATE employee
SET authorization_status = 'synced',
    authorization_version = authorization_version + 1,
    authorization_updated_at = CURRENT_TIMESTAMP
WHERE status = true
  AND deleted_at IS NULL
  AND authorization_status = 'pending';

COMMIT;

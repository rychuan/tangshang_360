BEGIN;

ALTER TABLE authorization_sync_job
  ADD COLUMN IF NOT EXISTS claim_token UUID;

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT employee_id, authorization_version
    FROM authorization_sync_job
    GROUP BY employee_id, authorization_version
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create authorization job unique index: duplicate employee/version rows: %',
      duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX authorization_sync_job_employee_version_unique
  ON authorization_sync_job (employee_id, authorization_version);

COMMIT;

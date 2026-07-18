import {
  effectiveAuthorizationRoles,
  normalizeAuthorizationRoles,
} from '../../server/modules/role-manager/authorization-state';
import { readFileSync } from 'node:fs';
import { authorizationSyncJob, employee } from '../../server/database/schema';

type IsAny<T> = 0 extends 1 & T ? true : false;
type ExpectExactlyStringArray<T> =
  IsAny<T> extends true
    ? never
    : T extends string[]
      ? string[] extends T
        ? true
        : never
      : never;

const employeeAuthorizationRolesCheck: ExpectExactlyStringArray<
  typeof employee.$inferSelect.authorizationRoles
> = true;
type DesiredRolesFieldMustBeAbsent =
  'desiredRoles' extends keyof typeof authorizationSyncJob.$inferSelect
    ? never
    : true;
const authorizationJobDesiredRolesCheck: DesiredRolesFieldMustBeAbsent = true;

describe('authorization state helpers', () => {
  it('keeps authorization role fields typed as string arrays', () => {
    expect(employeeAuthorizationRolesCheck).toBe(true);
    expect(authorizationJobDesiredRolesCheck).toBe(true);
  });

  it('normalizes authorization roles', () => {
    expect(
      normalizeAuthorizationRoles([' admin ', 'employee', 'admin', '']),
    ).toEqual(['admin', 'employee']);
  });

  it('derives effective authorization roles for active employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: true,
        deletedAt: null,
        authorizationRoles: ['admin'],
      }),
    ).toEqual(['admin']);
  });

  it('returns no effective authorization roles for inactive employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: false,
        deletedAt: null,
        authorizationRoles: ['admin'],
      }),
    ).toEqual([]);
  });

  it('returns no effective authorization roles for deleted employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: true,
        deletedAt: new Date('2026-07-18T00:00:00Z'),
        authorizationRoles: ['admin'],
      }),
    ).toEqual([]);
  });

  it('documents authorization status and JSONB array constraints in the migration', () => {
    const migration = readFileSync(
      'server/database/migrations/015_authorization_consistency.sql',
      'utf8',
    );

    expect(migration).toContain(
      "authorization_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
    );
    expect(migration).toContain(
      "status VARCHAR(20) NOT NULL DEFAULT 'pending'",
    );
    expect(migration).toContain(
      "authorization_roles JSONB NOT NULL DEFAULT '[]'::jsonb",
    );
    expect(migration).toContain(
      `CHECK (
      jsonb_typeof(authorization_roles) = 'array'
      AND NOT jsonb_path_exists(authorization_roles, '$[*] ? (@.type() != "string")')
    )`,
    );
    expect(migration).toContain(
      "CHECK (authorization_status IN ('pending', 'synced', 'failed'))",
    );
    expect(migration).not.toContain('desired_roles');
    expect(migration).toContain(
      "CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'superseded'))",
    );
    expect(migration).toContain('claim_token UUID');
    expect(migration).not.toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS authorization_sync_job_employee_version_unique',
    );

    const migration016 = readFileSync(
      'server/database/migrations/016_authorization_job_unique_index.sql',
      'utf8',
    );
    expect(migration016).toContain('ADD COLUMN IF NOT EXISTS claim_token UUID');
    expect(migration016).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS authorization_sync_job_employee_version_unique',
    );
    expect(migration016).toContain('duplicate employee/version rows');
    expect(migration016).toContain('UPDATE authorization_sync_job');
    expect(migration016).toContain("status = 'failed'");
    expect(migration016).toContain('started_at IS NULL');
  });
});

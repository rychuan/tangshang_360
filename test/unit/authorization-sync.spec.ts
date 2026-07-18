import 'reflect-metadata';

import { authorizationSyncJob, employee } from '../../server/database/schema';
import { RoleManagerService } from '../../server/modules/role-manager/role-manager.service';
import {
  AuthorizationSyncService,
  type AuthorizationSyncResult,
} from '../../server/modules/role-manager/authorization-sync.service';

type EmployeeRow = {
  employeeId: string;
  authorizationRoles: string[];
  authorizationStatus: 'pending' | 'synced' | 'failed';
  authorizationVersion: number;
  status: boolean;
  deletedAt: Date | string | null;
};

type JobRow = {
  id: string;
  employeeId: string;
  authorizationVersion: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'superseded';
  attemptCount: number;
  errorMessage: string | null;
};

type Table = typeof employee | typeof authorizationSyncJob;

type Predicate = {
  column: { table: Table; name: string };
  values: unknown[];
};

function isColumn(value: unknown): value is Predicate['column'] {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'name' in value &&
    'table' in value &&
    !('queryChunks' in value),
  );
}

function isParam(value: unknown): value is { value: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'value' in value &&
    'encoder' in value,
  );
}

function collectPredicates(condition: unknown, output: Predicate[] = []) {
  const chunks = (condition as { queryChunks?: unknown[] } | undefined)
    ?.queryChunks;
  if (!Array.isArray(chunks)) return output;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (isColumn(chunk)) {
      const operator = (chunks[index + 1] as { value?: string[] } | undefined)
        ?.value?.[0];
      const right = chunks[index + 2];
      if (operator === ' = ' && isParam(right)) {
        output.push({ column: chunk, values: [right.value] });
      } else if (operator === ' in ' && Array.isArray(right)) {
        output.push({
          column: chunk,
          values: right.filter(isParam).map((param) => param.value),
        });
      }
    } else if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
      collectPredicates(chunk, output);
    }
  }

  return output;
}

function propertyName(columnName: string): string {
  return columnName.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function matches(
  table: Table,
  row: Record<string, unknown>,
  condition: unknown,
): boolean {
  return collectPredicates(condition).every((predicate) => {
    if (predicate.column.table !== table) return true;
    const actual = row[propertyName(predicate.column.name)];
    return predicate.values.includes(actual);
  });
}

function project(
  selection: Record<string, unknown>,
  table: Table,
  row: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(selection).map(([key, column]) => [
      key,
      isColumn(column) ? row[propertyName(column.name)] : row[key],
    ]),
  );
}

class StatefulDb {
  readonly employees: EmployeeRow[];
  readonly jobs: JobRow[];
  readonly updates: Array<{
    table: Table;
    values: Record<string, unknown>;
    condition: unknown;
    matched: number;
  }> = [];
  readonly claims: string[] = [];

  constructor(employeeRow: EmployeeRow, jobs: JobRow[]) {
    this.employees = [employeeRow];
    this.jobs = jobs;
  }

  select = jest.fn((selection: Record<string, unknown>) => {
    const query = {
      table: undefined as Table | undefined,
      condition: undefined as unknown,
      from: jest.fn((table: Table) => {
        query.table = table;
        return query;
      }),
      where: jest.fn((condition: unknown) => {
        query.condition = condition;
        return query;
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn(async (limit: number) => {
        const rows = this.rows(query.table).filter((row) =>
          matches(query.table!, row, query.condition),
        );
        return rows
          .slice(0, limit)
          .map((row) => project(selection, query.table!, row));
      }),
    };
    return query;
  });

  update = jest.fn((table: Table) => {
    const query = {
      values: {} as Record<string, unknown>,
      condition: undefined as unknown,
      executed: false,
      result: [] as Record<string, unknown>[],
      set: jest.fn((values: Record<string, unknown>) => {
        query.values = values;
        return query;
      }),
      where: jest.fn((condition: unknown) => {
        query.condition = condition;
        return query;
      }),
      returning: jest.fn(async (selection: Record<string, unknown>) => {
        const rows = query.executed
          ? query.result
          : this.executeUpdate(table, query);
        query.executed = true;
        query.result = rows;
        return rows.map((row) => project(selection, table, row));
      }),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const rows = query.executed
          ? query.result
          : this.executeUpdate(table, query);
        query.executed = true;
        query.result = rows;
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return query;
  });

  insert = jest.fn((table: Table) => ({
    values: jest.fn(async (values: Record<string, unknown>) => {
      if (table !== authorizationSyncJob) return;
      const duplicate = this.jobs.some(
        (job) =>
          job.employeeId === values.employeeId &&
          job.authorizationVersion === values.authorizationVersion,
      );
      if (duplicate) {
        throw new Error('authorization job version already exists');
      }
      this.jobs.push({
        id: `job-${this.jobs.length + 1}`,
        employeeId: String(values.employeeId),
        authorizationVersion: Number(values.authorizationVersion),
        status: String(values.status) as JobRow['status'],
        attemptCount: Number(values.attemptCount ?? 0),
        errorMessage: (values.errorMessage as string | null) ?? null,
      });
    }),
  }));

  private rows(table: Table | undefined): Record<string, unknown>[] {
    return table === authorizationSyncJob ? this.jobs : this.employees;
  }

  private executeUpdate(
    table: Table,
    query: {
      values: Record<string, unknown>;
      condition: unknown;
    },
  ): Record<string, unknown>[] {
    const rows = this.rows(table).filter((row) =>
      matches(table, row, query.condition),
    );
    for (const row of rows) {
      for (const [key, value] of Object.entries(query.values)) {
        if (key === 'authorizationVersion' && typeof value !== 'number') {
          row[key] = Number(row[key]) + 1;
        } else if (key === 'attemptCount' && typeof value !== 'number') {
          row[key] = Number(row[key]) + 1;
        } else {
          row[key] = value;
        }
      }
      if (
        table === authorizationSyncJob &&
        query.values.status === 'processing'
      ) {
        this.claims.push(String(row.id));
      }
      this.updates.push({
        table,
        values: query.values,
        condition: query.condition,
        matched: rows.length,
      });
    }
    return rows;
  }
}

function createSdk(initialRoles: Record<string, string[]>) {
  const rolesByUser = new Map(
    Object.entries(initialRoles).map(([userId, roles]) => [
      userId,
      new Set(roles),
    ]),
  );
  const knownRoles = new Set(Object.values(initialRoles).flat());
  const events: string[] = [];

  const sdk = {
    roles: {
      list: jest.fn(async () => {
        events.push('roles.list');
        return [...knownRoles].map((bizID) => ({ bizID }));
      }),
    },
    members: {
      list: jest.fn(async (role: string) => {
        events.push(`list:${role}`);
        const userList = [...rolesByUser.entries()]
          .filter(([, roles]) => roles.has(role))
          .map(([userID]) => ({ userID }));
        return { members: { userList }, hasMore: false };
      }),
      add: jest.fn(async (role: string, input: any) => {
        const userId = input.members.userList[0].userID;
        events.push(`add:${role}`);
        knownRoles.add(role);
        if (!rolesByUser.has(userId)) rolesByUser.set(userId, new Set());
        rolesByUser.get(userId)!.add(role);
      }),
      remove: jest.fn(async (role: string, input: any) => {
        const userId = input.members.userList[0].userID;
        events.push(`remove:${role}`);
        rolesByUser.get(userId)?.delete(role);
      }),
    },
  };

  return { sdk, events, rolesByUser };
}

function createRoleManagerService(authzSDK: Record<string, any>) {
  return new (RoleManagerService as any)({}, authzSDK) as RoleManagerService;
}

function employeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    employeeId: 'employee-1',
    authorizationRoles: ['employee'],
    authorizationStatus: 'pending',
    authorizationVersion: 2,
    status: true,
    deletedAt: null,
    ...overrides,
  };
}

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-2',
    employeeId: 'employee-1',
    authorizationVersion: 2,
    status: 'pending',
    attemptCount: 0,
    errorMessage: null,
    ...overrides,
  };
}

function createSyncService(
  db: StatefulDb,
  roleManagerService: RoleManagerService,
) {
  return new (AuthorizationSyncService as any)(
    db,
    roleManagerService,
  ) as AuthorizationSyncService;
}

describe('durable authorization reconciliation', () => {
  it('removes stale privileged roles before adding desired roles', async () => {
    const { sdk, events, rolesByUser } = createSdk({
      'employee-1': ['admin'],
    });
    const service = createRoleManagerService(sdk);

    await service.reconcileUserRoles('employee-1', ['employee']);

    expect(
      events.filter(
        (event) => event.startsWith('remove:') || event.startsWith('add:'),
      ),
    ).toEqual(['remove:admin', 'add:employee']);
    expect([...rolesByUser.get('employee-1')!]).toEqual(['employee']);
  });

  it('marks matching version synced only after an exact SDK verification read', async () => {
    const { sdk, events, rolesByUser } = createSdk({
      'employee-1': ['admin', 'employee'],
    });
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    const service = createSyncService(db, createRoleManagerService(sdk));

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'synced',
      version: 2,
    });
    expect([...rolesByUser.get('employee-1')!]).toEqual(['employee']);
    expect(events.filter((event) => event.startsWith('list:'))).toHaveLength(4);
    expect(db.employees[0].authorizationStatus).toBe('synced');
    expect(db.jobs[0].status).toBe('succeeded');
  });

  it('marks matching version failed after a partial SDK failure', async () => {
    const { sdk } = createSdk({
      'employee-1': ['admin', 'employee'],
    });
    sdk.members.remove.mockImplementationOnce(async () => {
      throw new Error('remove admin failed');
    });
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    const service = createSyncService(db, createRoleManagerService(sdk));

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result.status).toBe('failed');
    expect(db.employees[0].authorizationStatus).toBe('failed');
    expect(db.jobs[0].status).toBe('failed');
  });

  it('does not mark an obsolete version synced', async () => {
    const { sdk } = createSdk({ 'employee-1': ['admin'] });
    const db = new StatefulDb(employeeRow({ authorizationVersion: 4 }), [
      jobRow({ authorizationVersion: 3 }),
    ]);
    const service = createSyncService(db, createRoleManagerService(sdk));

    const result = await service.processEmployeeAuthorization('employee-1', 3);

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'superseded',
      version: 3,
    });
    expect(sdk.roles.list).not.toHaveBeenCalled();
    expect(db.jobs[0].status).toBe('superseded');
    expect(db.employees[0].authorizationStatus).not.toBe('synced');
  });

  it('retries a failed latest-version job idempotently', async () => {
    const { sdk, rolesByUser } = createSdk({
      'employee-1': ['employee'],
    });
    const db = new StatefulDb(employeeRow({ authorizationStatus: 'failed' }), [
      jobRow({ status: 'failed', attemptCount: 1 }),
    ]);
    const service = createSyncService(db, createRoleManagerService(sdk));

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'synced',
      version: 2,
    });
    expect([...rolesByUser.get('employee-1')!]).toEqual(['employee']);
    expect(db.jobs[0].status).toBe('succeeded');
  });

  it('does not retry a succeeded job or call the SDK', async () => {
    const db = new StatefulDb(
      employeeRow({ authorizationStatus: 'synced' }),
      [jobRow({ status: 'succeeded' })],
    );
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(
      db,
      { reconcileUserRoles: reconcile } as any,
    );

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result.status).toBe('not_processable');
    expect(reconcile).not.toHaveBeenCalled();
    expect(db.jobs[0].status).toBe('succeeded');
  });

  it('allows only one of two workers to claim a job', async () => {
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const roleManager = { reconcileUserRoles: reconcile } as any;
    const first = createSyncService(db, roleManager);
    const second = createSyncService(db, roleManager);

    const results = await Promise.all([
      first.processEmployeeAuthorization('employee-1'),
      second.processEmployeeAuthorization('employee-1'),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'not_processable',
      'synced',
    ]);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(db.claims).toEqual(['job-2']);
    expect(db.jobs[0].status).toBe('succeeded');
  });

  it('allocates different versions for concurrent staging calls', async () => {
    const db = new StatefulDb(employeeRow(), []);
    const service = createSyncService(db, {} as RoleManagerService);

    const versions = await Promise.all([
      service.stageAuthorizationChange(db as any, 'employee-1', ['employee']),
      service.stageAuthorizationChange(db as any, 'employee-1', ['admin']),
    ]);

    expect(versions.sort()).toEqual([3, 4]);
    expect(db.employees[0].authorizationVersion).toBe(4);
    expect(db.jobs.map((job) => job.authorizationVersion).sort()).toEqual([
      3, 4,
    ]);
  });

  it('does not reconcile when the latest version has no job', async () => {
    const db = new StatefulDb(employeeRow(), []);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result.status).toBe('not_processable');
    expect(reconcile).not.toHaveBeenCalled();
    expect(db.employees[0].authorizationStatus).not.toBe('synced');
  });

  it('does not write back when the employee version changes during SDK reconcile', async () => {
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    let releaseReconcile!: () => void;
    const reconcile = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReconcile = resolve;
        }),
    );
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const processing = service.processEmployeeAuthorization('employee-1');
    await new Promise((resolve) => setImmediate(resolve));
    db.employees[0].authorizationVersion = 3;
    db.employees[0].authorizationRoles = ['admin'];
    releaseReconcile();

    const result = await processing;

    expect(result.status).toBe('superseded');
    expect(db.employees[0].authorizationStatus).toBe('pending');
    expect(db.jobs[0].status).toBe('superseded');
  });

  it('does not let a failed worker overwrite a succeeded job', async () => {
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    let releaseReconcile!: () => void;
    const reconcile = jest.fn(
      () =>
        new Promise<void>((_, reject) => {
          releaseReconcile = () => reject(new Error('late SDK failure'));
        }),
    );
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const processing = service.processEmployeeAuthorization('employee-1');
    await new Promise((resolve) => setImmediate(resolve));
    db.jobs[0].status = 'succeeded';
    releaseReconcile();

    await processing;

    expect(db.jobs[0].status).toBe('succeeded');
    expect(db.employees[0].authorizationStatus).not.toBe('failed');
  });

  it.each([
    ['inactive', { status: false, deletedAt: null }],
    ['deleted', { status: true, deletedAt: new Date('2026-07-18') }],
  ])('converges %s employees to no SDK roles', async (_, state) => {
    const { sdk, rolesByUser } = createSdk({
      'employee-1': ['admin', 'employee'],
    });
    const db = new StatefulDb(employeeRow(state), [jobRow()]);
    const service = createSyncService(db, createRoleManagerService(sdk));

    await service.processEmployeeAuthorization('employee-1');

    expect([...rolesByUser.get('employee-1')!]).toEqual([]);
    expect(db.employees[0].authorizationStatus).toBe('synced');
  });
});

import 'reflect-metadata';

import { authorizationSyncJob, employee } from '../../server/database/schema';
import { RoleManagerService } from '../../server/modules/role-manager/role-manager.service';
import {
  AUTHORIZATION_JOB_LEASE_MS,
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
  startedAt: Date | null;
  claimToken: string | null;
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

function isSql(value: unknown): value is { queryChunks: unknown[] } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'queryChunks' in value &&
    Array.isArray((value as { queryChunks?: unknown[] }).queryChunks),
  );
}

function evaluateCondition(
  table: Table,
  row: Record<string, unknown>,
  condition: unknown,
): boolean {
  const chunks = (condition as { queryChunks?: unknown[] } | undefined)
    ?.queryChunks;
  if (!Array.isArray(chunks)) return true;

  const nested = chunks.filter(isSql);
  const logicalOperator = chunks
    .filter((chunk): chunk is { value: string[] } =>
      Boolean(
        chunk &&
        typeof chunk === 'object' &&
        'value' in chunk &&
        Array.isArray((chunk as { value?: unknown }).value),
      ),
    )
    .flatMap((chunk) => chunk.value)
    .find((value) => value.includes(' and ') || value.includes(' or '));

  if (logicalOperator && nested.length > 0) {
    if (logicalOperator.includes(' or ')) {
      return nested.some((child) => evaluateCondition(table, row, child));
    }
    return nested.every((child) => evaluateCondition(table, row, child));
  }

  if (nested.length === 1) {
    return evaluateCondition(table, row, nested[0]);
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!isColumn(chunk)) continue;
    const operator = (chunks[index + 1] as { value?: string[] } | undefined)
      ?.value?.[0];
    const right = chunks[index + 2];
    const actual = row[propertyName(chunk.name)];

    if (operator === ' = ' && isParam(right)) {
      return chunk.table !== table || actual === right.value;
    }
    if (operator === ' < ' && isParam(right)) {
      return (
        chunk.table !== table ||
        (actual instanceof Date &&
          right.value instanceof Date &&
          actual.getTime() < right.value.getTime())
      );
    }
    if (operator === ' is null') {
      return chunk.table !== table || actual == null;
    }
    if (operator === ' in ' && Array.isArray(right)) {
      return (
        chunk.table !== table ||
        right.filter(isParam).some((param) => actual === param.value)
      );
    }
  }

  return true;
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
  return evaluateCondition(table, row, condition);
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
        startedAt: (values.startedAt as Date | null) ?? null,
        claimToken: (values.claimToken as string | null) ?? null,
      });
    }),
  }));

  transaction = jest.fn(
    async <T>(callback: (tx: StatefulDb) => Promise<T>): Promise<T> => {
      const transactionDb = new StatefulDb(
        { ...this.employees[0] },
        this.jobs.map((job) => ({ ...job })),
      );
      const result = await callback(transactionDb);
      this.employees.splice(0, 1, transactionDb.employees[0]);
      this.jobs.splice(0, this.jobs.length, ...transactionDb.jobs);
      this.updates.push(...transactionDb.updates);
      this.claims.push(...transactionDb.claims);
      return result;
    },
  );

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
      // 新 contract：一次调用返回每个角色的 roleMembers.userList，
      // 服务端据此判定成员身份（不再逐角色调 members.list）
      list: jest.fn(async () => {
        events.push('roles.list');
        return [...knownRoles].map((bizID) => ({
          bizID,
          roleMembers: {
            userList: [...rolesByUser.entries()]
              .filter(([, roles]) => roles.has(bizID))
              .map(([userID]) => ({ userID })),
          },
        }));
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
    startedAt: null,
    claimToken: null,
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
    // 新实现：reconcile 前读取一次 + 变更后验证读一次（共 2 次 roles.list）
    expect(events.filter((event) => event === 'roles.list')).toHaveLength(2);
    expect(db.employees[0].authorizationStatus).toBe('synced');
    expect(db.jobs[0].status).toBe('succeeded');
    expect(db.jobs[0].claimToken).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
    expect(db.transaction).toHaveBeenCalled();
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
    const db = new StatefulDb(employeeRow({ authorizationStatus: 'synced' }), [
      jobRow({ status: 'succeeded' }),
    ]);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result.status).toBe('stale_owner');
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
      'stale_owner',
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

    expect(result.status).toBe('stale_owner');
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

  it('does not let a failed worker overwrite a successful retry after exposure', async () => {
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    let releaseFirst!: () => void;
    const firstRoleManager = {
      reconcileUserRoles: jest.fn(
        () =>
          new Promise<void>((_, reject) => {
            releaseFirst = () => reject(new Error('first worker failed'));
          }),
      ),
    };
    const secondRoleManager = {
      reconcileUserRoles: jest.fn().mockResolvedValue(undefined),
    };
    const first = createSyncService(db, firstRoleManager as any);
    const second = createSyncService(db, secondRoleManager as any);

    const firstProcessing = first.processEmployeeAuthorization('employee-1');
    await new Promise((resolve) => setImmediate(resolve));
    db.jobs[0].status = 'failed';

    await expect(
      second.processEmployeeAuthorization('employee-1'),
    ).resolves.toMatchObject({ status: 'synced' });
    releaseFirst();
    const firstResult = await firstProcessing;

    expect(db.jobs[0].status).toBe('succeeded');
    expect(db.employees[0].authorizationStatus).toBe('synced');
    expect(firstResult.status).toBe('stale_owner');
  });

  it('does not finalize with an incorrect claim token', async () => {
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
    db.jobs[0].claimToken = '00000000-0000-0000-0000-000000000000';
    releaseReconcile();

    const result = await processing;

    expect(result.status).toBe('stale_owner');
    expect(db.employees[0].authorizationStatus).toBe('pending');
    expect(db.jobs[0].status).toBe('processing');
  });

  it('reclaims an expired processing lease with a fresh claim token', async () => {
    const oldToken = '11111111-1111-1111-1111-111111111111';
    const db = new StatefulDb(employeeRow(), [
      jobRow({
        status: 'processing',
        startedAt: new Date(Date.now() - AUTHORIZATION_JOB_LEASE_MS - 1),
        claimToken: oldToken,
      }),
    ]);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result.status).toBe('synced');
    expect(db.jobs[0].claimToken).not.toBe(oldToken);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim an unexpired processing lease', async () => {
    const token = '22222222-2222-2222-2222-222222222222';
    const db = new StatefulDb(employeeRow(), [
      jobRow({
        status: 'processing',
        startedAt: new Date(Date.now() - AUTHORIZATION_JOB_LEASE_MS + 1),
        claimToken: token,
      }),
    ]);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result.status).toBe('stale_owner');
    expect(db.jobs[0].claimToken).toBe(token);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('reclaims a processing lease with a null startedAt', async () => {
    const oldToken = '66666666-6666-6666-6666-666666666666';
    const db = new StatefulDb(employeeRow(), [
      jobRow({
        status: 'processing',
        startedAt: null,
        claimToken: oldToken,
      }),
    ]);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result.status).toBe('synced');
    expect(db.jobs[0].claimToken).not.toBe(oldToken);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('does not finalize failed when the claim token is stale', async () => {
    const db = new StatefulDb(employeeRow(), [jobRow()]);
    const reconcile = jest.fn(async () => {
      db.jobs[0].claimToken = '33333333-3333-3333-3333-333333333333';
      throw new Error('sdk failed');
    });
    const service = createSyncService(db, {
      reconcileUserRoles: reconcile,
    } as any);

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result.status).toBe('stale_owner');
    expect(db.jobs[0].status).toBe('processing');
    expect(db.employees[0].authorizationStatus).toBe('pending');
  });

  it('does not finalize superseded when the claim token is stale', async () => {
    const db = new StatefulDb(employeeRow({ authorizationVersion: 3 }), [
      jobRow({ authorizationVersion: 2 }),
    ]);
    const service = createSyncService(db, {} as RoleManagerService);
    jest.spyOn(service as any, 'claimJob').mockImplementation(async () => {
      db.jobs[0].status = 'processing';
      db.jobs[0].claimToken = '44444444-4444-4444-4444-444444444444';
      return {
        id: db.jobs[0].id,
        claimToken: '55555555-5555-5555-5555-555555555555',
      };
    });

    const result = await service.processEmployeeAuthorization('employee-1', 2);

    expect(result.status).toBe('stale_owner');
    expect(db.jobs[0].status).toBe('processing');
    expect(db.employees[0].authorizationStatus).toBe('pending');
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

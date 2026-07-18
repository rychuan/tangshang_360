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
};

type JobRow = {
  id: string;
  employeeId: string;
  authorizationVersion: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'superseded';
  attemptCount: number;
};

function queryFor<T>(rows: T[]) {
  const query = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    returning: jest.fn().mockResolvedValue(rows),
    then: (
      resolve: (value: T[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

function createSdk(
  initialRoles: Record<string, string[]>,
  options: { removeFailure?: Error } = {},
) {
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
        if (options.removeFailure && role === 'admin') {
          throw options.removeFailure;
        }
        rolesByUser.get(userId)?.delete(role);
      }),
    },
  };

  return { sdk, events, rolesByUser };
}

function createRoleManagerService(authzSDK: Record<string, any>) {
  return new (RoleManagerService as any)({}, authzSDK) as RoleManagerService;
}

function createSyncDb(employeeRow: EmployeeRow, jobRow: JobRow) {
  const events: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const insertedJobs: Array<Record<string, unknown>> = [];
  const db = {
    select: jest.fn((selection: unknown) => {
      const query = {
        from: jest.fn((table: unknown) => {
          query.table = table;
          return query;
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(async () => {
          if (query.table === authorizationSyncJob) return [jobRow];
          return [employeeRow];
        }),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(
            query.table === authorizationSyncJob ? [jobRow] : [employeeRow],
          ).then(resolve, reject),
        selection,
        table: undefined as unknown,
      };
      return query;
    }),
    update: jest.fn(() => {
      const query = {
        set: jest.fn((values: Record<string, unknown>) => {
          updates.push(values);
          if ('authorizationStatus' in values) {
            events.push(`employee:${values.authorizationStatus}`);
          } else if ('status' in values) {
            events.push(`job:${values.status}`);
          }
          return query;
        }),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn(async () =>
          updates.at(-1)?.authorizationStatus
            ? [{ authorizationVersion: employeeRow.authorizationVersion }]
            : [],
        ),
      };
      return query;
    }),
    insert: jest.fn(() => ({
      values: jest.fn(async (values: Record<string, unknown>) => {
        insertedJobs.push(values);
      }),
    })),
  };

  return { db, events, updates, insertedJobs };
}

function createSyncService(
  employeeRow: EmployeeRow,
  jobRow: JobRow,
  roleManagerService: RoleManagerService,
) {
  const dbState = createSyncDb(employeeRow, jobRow);
  const service = new (AuthorizationSyncService as any)(
    dbState.db,
    roleManagerService,
  ) as AuthorizationSyncService;
  return { service, ...dbState };
}

describe('durable authorization reconciliation', () => {
  it('removes stale privileged roles before adding desired roles', async () => {
    const { sdk, events } = createSdk({
      'employee-1': ['admin'],
    });
    const service = createRoleManagerService(sdk);
    jest
      .spyOn(service, 'getUserRolesStrict')
      .mockResolvedValueOnce(['admin'])
      .mockResolvedValueOnce(['employee']);

    await (service as any).reconcileUserRoles('employee-1', ['employee']);

    expect(
      events.filter(
        (event) => event.startsWith('remove:') || event.startsWith('add:'),
      ),
    ).toEqual(['remove:admin', 'add:employee']);
    expect(service.getUserRolesStrict).toHaveBeenCalledTimes(2);
  });

  it('marks matching version synced only after an exact SDK verification read', async () => {
    const { sdk, events } = createSdk({
      'employee-1': ['admin'],
    });
    const roleManagerService = createRoleManagerService(sdk);
    const { service, events: dbEvents } = createSyncService(
      {
        employeeId: 'employee-1',
        authorizationRoles: ['employee'],
        authorizationStatus: 'pending',
        authorizationVersion: 2,
      },
      {
        id: 'job-2',
        employeeId: 'employee-1',
        authorizationVersion: 2,
        status: 'pending',
        attemptCount: 0,
      },
      roleManagerService,
    );

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'synced',
      version: 2,
    });
    expect(events.filter((event) => event.startsWith('list:'))).toEqual([
      'list:admin',
      'list:admin',
      'list:employee',
    ]);
    expect(dbEvents).toEqual(
      expect.arrayContaining([expect.stringContaining('employee:synced')]),
    );
  });

  it('marks matching version failed after a partial SDK failure', async () => {
    const { sdk } = createSdk(
      {
        'employee-1': ['admin', 'employee'],
      },
      { removeFailure: new Error('remove admin failed') },
    );
    const roleManagerService = createRoleManagerService(sdk);
    const { service, updates } = createSyncService(
      {
        employeeId: 'employee-1',
        authorizationRoles: ['employee'],
        authorizationStatus: 'pending',
        authorizationVersion: 3,
      },
      {
        id: 'job-3',
        employeeId: 'employee-1',
        authorizationVersion: 3,
        status: 'pending',
        attemptCount: 0,
      },
      roleManagerService,
    );

    const result = await service.processEmployeeAuthorization('employee-1');

    expect(result.status).toBe('failed');
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorizationStatus: 'failed',
          authorizationVersion: 3,
        }),
      ]),
    );
    expect(updates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ authorizationStatus: 'synced' }),
      ]),
    );
  });

  it('does not mark an obsolete version synced', async () => {
    const { sdk, events } = createSdk({
      'employee-1': ['admin'],
    });
    const roleManagerService = createRoleManagerService(sdk);
    const { service, updates } = createSyncService(
      {
        employeeId: 'employee-1',
        authorizationRoles: ['employee'],
        authorizationStatus: 'pending',
        authorizationVersion: 4,
      },
      {
        id: 'job-3',
        employeeId: 'employee-1',
        authorizationVersion: 3,
        status: 'pending',
        attemptCount: 0,
      },
      roleManagerService,
    );

    const result = await service.processEmployeeAuthorization('employee-1', 3);

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'superseded',
      version: 3,
    });
    expect(events).toEqual([]);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'superseded' }),
      ]),
    );
    expect(updates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ authorizationStatus: 'synced' }),
      ]),
    );
  });

  it('retries a failed latest-version job idempotently', async () => {
    const { sdk } = createSdk({
      'employee-1': ['employee'],
    });
    const roleManagerService = createRoleManagerService(sdk);
    const { service, updates } = createSyncService(
      {
        employeeId: 'employee-1',
        authorizationRoles: ['employee'],
        authorizationStatus: 'failed',
        authorizationVersion: 5,
      },
      {
        id: 'job-5',
        employeeId: 'employee-1',
        authorizationVersion: 5,
        status: 'failed',
        attemptCount: 1,
      },
      roleManagerService,
    );

    const result = await service.retryEmployeeAuthorization('employee-1');

    expect(result).toEqual<AuthorizationSyncResult>({
      status: 'synced',
      version: 5,
    });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorizationStatus: 'synced',
          authorizationVersion: 5,
        }),
      ]),
    );
  });
});

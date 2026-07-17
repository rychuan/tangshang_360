import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';
import { TeamStructureService } from '../../server/modules/team-structure/team-structure.service';

const EXPECTED_LAST_ADMIN_LOCK_KEY = 20_260_717;

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function countQuery(value: number) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([{ cnt: value }]),
  };
}

function createAdminMutationTransaction(adminCount = 2) {
  const countWhere = jest.fn().mockResolvedValue([{ cnt: adminCount }]);
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const auditValues = jest.fn().mockResolvedValue(undefined);
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: countWhere,
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: updateSet,
    }),
    insert: jest.fn().mockReturnValue({
      values: auditValues,
    }),
  };
  return { tx, countWhere, updateWhere, auditValues };
}

function createEmployeeService(
  db: Record<string, any>,
  roles: string[] = ['admin'],
) {
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(['admin']),
    checkUserPermission: jest.fn().mockResolvedValue(true),
    getUserRolesStrict: jest.fn().mockResolvedValue(roles),
    syncUserRolesStrict: jest.fn().mockResolvedValue(undefined),
  };
  const accessScopeService = {
    canAccessEmployee: jest.fn().mockResolvedValue(true),
    getScope: jest.fn().mockResolvedValue({
      kind: 'global',
      roles: ['admin'],
      departmentIds: [],
      subordinateIds: [],
    }),
  };
  const service = new (EmployeeManagementService as any)(
    db,
    roleManagerService,
    {},
    accessScopeService,
  ) as EmployeeManagementService;
  return { service, roleManagerService };
}

function expectLockBeforeCountAndMutation(
  tx: Record<string, jest.Mock>,
  mutationCallOrder: number,
) {
  expect(tx.execute).toHaveBeenCalled();
  const lockSql = tx.execute.mock.calls[0][0] as {
    queryChunks?: Array<{ value?: string[] } | number>;
  };
  expect(lockSql.queryChunks?.[0]).toEqual(
    expect.objectContaining({
      value: expect.arrayContaining([
        expect.stringContaining('pg_advisory_xact_lock'),
      ]),
    }),
  );
  expect(lockSql.queryChunks).toContain(EXPECTED_LAST_ADMIN_LOCK_KEY);
  expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
    tx.select.mock.invocationCallOrder[0],
  );
  expect(tx.select.mock.invocationCallOrder[0]).toBeLessThan(
    mutationCallOrder,
  );
}

describe('last active admin concurrency protection', () => {
  it('locks before recounting and demoting an active admin', async () => {
    const { tx } = createAdminMutationTransaction();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { employeeId: 'admin-2', role: 'admin', status: true },
          ]),
        )
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createEmployeeService(db);

    await service.update(
      'admin-2',
      {
        name: '管理员二',
        position: '负责人',
        positionCode: 'manager',
        department: '管理部',
        departmentId: 'dept-1',
        supervisorId: 'admin-1',
        role: 'employee',
      },
      'admin-1',
    );

    expectLockBeforeCountAndMutation(
      tx as any,
      tx.update.mock.invocationCallOrder[0],
    );
  });

  it('locks before recounting and deactivating an active admin', async () => {
    const { tx } = createAdminMutationTransaction();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { employeeId: 'admin-2', role: 'admin', status: true },
          ]),
        )
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createEmployeeService(db);

    await service.deactivate('admin-2', 'admin-1');

    expectLockBeforeCountAndMutation(
      tx as any,
      tx.update.mock.invocationCallOrder[0],
    );
  });

  it('locks before recounting and deleting an active admin', async () => {
    const { tx } = createAdminMutationTransaction();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-2',
              role: 'admin',
              status: true,
              name: '管理员二',
              position: '负责人',
              department: '管理部',
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createEmployeeService(db);

    await service.delete('admin-2', 'admin-1');

    expectLockBeforeCountAndMutation(
      tx as any,
      tx.update.mock.invocationCallOrder[0],
    );
  });

  it('locks before recounting an imported active-admin role or status removal', async () => {
    const { tx } = createAdminMutationTransaction();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-2',
              role: 'admin',
              status: true,
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createEmployeeService(db);

    await service.syncImportedEmployee(
      'admin-2',
      {
        name: '管理员二',
        position: '负责人',
        positionCode: 'manager',
        department: '管理部',
        departmentId: 'dept-1',
        supervisorId: 'admin-1',
        role: 'employee',
      },
      false,
      'admin-1',
    );

    expectLockBeforeCountAndMutation(
      tx as any,
      tx.update.mock.invocationCallOrder[0],
    );
  });

  it('uses the shared lock before recounting and legacy batch deactivation', async () => {
    const { tx } = createAdminMutationTransaction();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest
            .fn()
            .mockResolvedValue([{ employeeId: 'admin-2', role: 'admin' }]),
        })
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRolesStrict: jest.fn().mockResolvedValue(['admin']),
      syncUserRolesStrict: jest.fn().mockResolvedValue(undefined),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      roleManagerService,
      accessScopeService,
    ) as TeamStructureService;

    await service.batchDeactivate(['admin-2'], 'admin-1');

    expectLockBeforeCountAndMutation(
      tx as any,
      tx.execute.mock.invocationCallOrder[1],
    );
  });
});

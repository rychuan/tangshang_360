import { ForbiddenException } from '@nestjs/common';
import { DepartmentService } from '../../server/modules/department/department.service';
import { DepartmentConcurrencyDb } from './department-concurrency-fake';

function forUpdateQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    for: jest.fn().mockResolvedValue(rows),
  };
}

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function createDepartmentInsert(id = 'dept-1') {
  return {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id }]),
    }),
  };
}

function globalScope() {
  return {
    getScope: jest.fn().mockResolvedValue({
      kind: 'global',
      roles: ['admin'],
      departmentIds: [],
      subordinateIds: [],
    }),
  };
}

function syncedAuthorization(version = 1) {
  return {
    stageAuthorizationChange: jest.fn().mockResolvedValue(version),
    processEmployeeAuthorization: jest.fn().mockResolvedValue({
      status: 'synced',
      version,
    }),
  };
}

function adminRoleManager(canEdit = true) {
  return {
    getUserRoles: jest.fn().mockResolvedValue(['admin']),
    checkUserPermission: jest.fn().mockResolvedValue(canEdit),
    ensureUserRoleStrict: jest.fn(),
    removeUserRoleStrict: jest.fn(),
  };
}

function createConcurrentService(db: DepartmentConcurrencyDb) {
  const roleManagerService = adminRoleManager();
  const authorizationSyncService = db.createAuthorizationSyncService();
  const service = new (DepartmentService as any)(
    db,
    {},
    roleManagerService,
    globalScope(),
    authorizationSyncService,
  ) as DepartmentService;
  return { service, roleManagerService, authorizationSyncService };
}

describe('department head role mutation', () => {
  it('requires built-in admin identity and permission_management edit before assigning a head', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('department query attempted');
      }),
    };
    const roleManagerService = adminRoleManager(false);
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      syncedAuthorization(),
    ) as DepartmentService;

    await expect(
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'operator-1',
      'permission_management',
      'edit',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('locks department then employee, stages durable roles in the transaction, and processes after commit', async () => {
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(createDepartmentInsert())
        .mockReturnValueOnce({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      select: jest
        .fn()
        .mockReturnValueOnce(
          forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: null }]),
        )
        .mockReturnValueOnce(
          forUpdateQuery([
            {
              employeeId: 'head-1',
              authorizationRoles: ['employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        )
        .mockReturnValueOnce(limitedQuery([{ id: 'dept-1' }])),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    let transactionActive = false;
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([])),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          transactionActive = true;
          try {
            return await callback(tx);
          } finally {
            transactionActive = false;
          }
        },
      ),
    };
    const roleManagerService = adminRoleManager();
    const authorizationSyncService = syncedAuthorization(3);
    authorizationSyncService.stageAuthorizationChange.mockImplementation(
      async () => {
        expect(transactionActive).toBe(true);
        return 3;
      },
    );
    authorizationSyncService.processEmployeeAuthorization.mockImplementation(
      async () => {
        expect(transactionActive).toBe(false);
        return { status: 'synced', version: 3 };
      },
    );
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(
      service.create({ name: '研发部', headId: 'head-1' }, 'operator-1'),
    ).resolves.toEqual({ id: 'dept-1' });

    expect(tx.select).toHaveBeenCalledTimes(3);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-1', ['dept_head', 'employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('head-1', 3);
    expect(roleManagerService.ensureUserRoleStrict).not.toHaveBeenCalled();
  });

  it('does not lock or stage employees when the locked department head is unchanged', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValue(
          forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: 'head-1' }]),
        ),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const authorizationSyncService = syncedAuthorization();
    const service = new (DepartmentService as any)(
      db,
      {},
      adminRoleManager(),
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(
      service.update(
        'dept-1',
        { name: '新研发部', headId: 'head-1' },
        'operator-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
  });

  it('removes the durable dept_head role when the new head is empty', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          forUpdateQuery([
            { id: 'dept-1', name: '研发部', headId: 'head-old' },
          ]),
        )
        .mockReturnValueOnce(
          forUpdateQuery([
            {
              employeeId: 'head-old',
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        )
        .mockReturnValueOnce(limitedQuery([])),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const authorizationSyncService = syncedAuthorization(3);
    const service = new (DepartmentService as any)(
      db,
      {},
      adminRoleManager(),
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await service.update(
      'dept-1',
      { name: '研发部', headId: '' },
      'operator-1',
    );

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-old', ['employee']);
  });

  it.each([
    { label: 'inactive', status: false, deletedAt: null },
    {
      label: 'deleted',
      status: false,
      deletedAt: new Date('2026-01-01'),
    },
  ])(
    'routes $label department heads through durable fail-closed authorization processing',
    async ({ status, deletedAt }) => {
      const tx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(createDepartmentInsert())
          .mockReturnValueOnce({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        select: jest
          .fn()
          .mockReturnValueOnce(
            forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: null }]),
          )
          .mockReturnValueOnce(
            forUpdateQuery([
              {
                employeeId: 'head-1',
                status,
                deletedAt,
                authorizationRoles: ['employee'],
                authorizationStatus: 'synced',
                authorizationVersion: 2,
              },
            ]),
          )
          .mockReturnValueOnce(limitedQuery([{ id: 'dept-1' }])),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      const db = {
        select: jest.fn().mockReturnValue(limitedQuery([])),
        transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const authorizationSyncService = syncedAuthorization(3);
      const service = new (DepartmentService as any)(
        db,
        {},
        adminRoleManager(),
        globalScope(),
        authorizationSyncService,
      ) as DepartmentService;

      await service.create({ name: '研发部', headId: 'head-1' }, 'operator-1');

      expect(
        authorizationSyncService.stageAuthorizationChange,
      ).toHaveBeenCalledWith(tx, 'head-1', ['dept_head', 'employee']);
      expect(
        authorizationSyncService.processEmployeeAuthorization,
      ).toHaveBeenCalledWith('head-1', 3);
    },
  );

  it('requires role-management authority when delete would remove the final head role', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: 'head-1' }]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(
          forUpdateQuery([
            {
              employeeId: 'head-1',
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        )
        .mockReturnValueOnce(limitedQuery([])),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const authorizationSyncService = syncedAuthorization();
    const service = new (DepartmentService as any)(
      {
        transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      },
      {},
      adminRoleManager(false),
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(service.remove('dept-1', 'operator-1')).rejects.toThrow(
      '无权修改部门负责人',
    );
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
  });

  it('stages final-head removal in the delete transaction and processes it afterward', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: 'head-1' }]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(
          forUpdateQuery([
            {
              employeeId: 'head-1',
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        )
        .mockReturnValueOnce(limitedQuery([]))
        .mockReturnValueOnce(limitedQuery([])),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    let transactionActive = false;
    const db = {
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          transactionActive = true;
          try {
            return await callback(tx);
          } finally {
            transactionActive = false;
          }
        },
      ),
    };
    const authorizationSyncService = syncedAuthorization(3);
    authorizationSyncService.stageAuthorizationChange.mockImplementation(
      async () => {
        expect(transactionActive).toBe(true);
        return 3;
      },
    );
    authorizationSyncService.processEmployeeAuthorization.mockImplementation(
      async () => {
        expect(transactionActive).toBe(false);
        return { status: 'synced', version: 3 };
      },
    );
    const service = new (DepartmentService as any)(
      db,
      {},
      adminRoleManager(),
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(service.remove('dept-1', 'operator-1')).resolves.toEqual({
      success: true,
    });
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-1', ['employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('head-1', 3);
  });

  it('locks and rereads the department before serializing concurrent updates to the same department', async () => {
    const db = new DepartmentConcurrencyDb({
      departments: [
        {
          id: 'dept-1',
          name: '研发部',
          parentId: null,
          headId: 'head-a',
          sortOrder: 0,
        },
      ],
      employees: [
        {
          employeeId: 'head-a',
          authorizationRoles: ['dept_head', 'employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
        {
          employeeId: 'head-b',
          authorizationRoles: ['employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
        {
          employeeId: 'head-c',
          authorizationRoles: ['employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
      ],
    });
    db.coordinateLegacyOutsideHeadReads(2);
    const { service } = createConcurrentService(db);

    await Promise.all([
      service.update(
        'dept-1',
        { name: '研发部', headId: 'head-b' },
        'operator-1',
      ),
      service.update(
        'dept-1',
        { name: '研发部', headId: 'head-c' },
        'operator-1',
      ),
    ]);

    expect(
      db.lockLog.filter((key) => key === 'department:dept-1'),
    ).toHaveLength(2);
    expect(db.getDepartment('dept-1')?.headId).toBe('head-c');
    expect(db.getRoles('head-a')).not.toContain('dept_head');
    expect(db.getRoles('head-b')).not.toContain('dept_head');
    expect(db.getRoles('head-c')).toContain('dept_head');
  });

  it('locks affected employees in sorted order and preserves roles during concurrent department swaps', async () => {
    const db = new DepartmentConcurrencyDb({
      departments: [
        {
          id: 'dept-a',
          name: '甲部',
          parentId: null,
          headId: 'head-a',
          sortOrder: 0,
        },
        {
          id: 'dept-b',
          name: '乙部',
          parentId: null,
          headId: 'head-b',
          sortOrder: 1,
        },
      ],
      employees: [
        {
          employeeId: 'head-a',
          authorizationRoles: ['dept_head', 'employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
        {
          employeeId: 'head-b',
          authorizationRoles: ['dept_head', 'employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
      ],
    });
    db.coordinateLegacyOutsideHeadReads(2);
    const { service } = createConcurrentService(db);

    await Promise.all([
      service.update(
        'dept-a',
        { name: '甲部', headId: 'head-b' },
        'operator-1',
      ),
      service.update(
        'dept-b',
        { name: '乙部', headId: 'head-a' },
        'operator-1',
      ),
    ]);

    const employeeLocks = db.lockLog.filter((key) =>
      key.startsWith('employee:'),
    );
    for (let index = 0; index < employeeLocks.length; index += 2) {
      expect(employeeLocks.slice(index, index + 2)).toEqual([
        'employee:head-a',
        'employee:head-b',
      ]);
    }
    expect(db.getDepartment('dept-a')?.headId).toBe('head-b');
    expect(db.getDepartment('dept-b')?.headId).toBe('head-a');
    expect(db.getRoles('head-a')).toContain('dept_head');
    expect(db.getRoles('head-b')).toContain('dept_head');
  });

  it('recomputes final roles after a concurrent new assignment and department delete', async () => {
    const db = new DepartmentConcurrencyDb({
      departments: [
        {
          id: 'dept-old',
          name: '旧部门',
          parentId: null,
          headId: 'head-a',
          sortOrder: 0,
        },
        {
          id: 'dept-new',
          name: '新部门',
          parentId: null,
          headId: null,
          sortOrder: 1,
        },
      ],
      employees: [
        {
          employeeId: 'head-a',
          authorizationRoles: ['dept_head', 'employee'],
          authorizationStatus: 'synced',
          authorizationVersion: 1,
        },
      ],
    });
    const paused = db.pauseNextLock('employee:head-a');
    const { service } = createConcurrentService(db);

    const assignment = service.update(
      'dept-new',
      { name: '新部门', headId: 'head-a' },
      'operator-1',
    );
    await paused.acquired;
    const removal = service.remove('dept-old', 'operator-1');
    paused.release();
    await Promise.all([assignment, removal]);

    expect(db.getDepartment('dept-old')).toBeUndefined();
    expect(db.getDepartment('dept-new')?.headId).toBe('head-a');
    expect(db.getRoles('head-a')).toContain('dept_head');
  });

  it('attempts every staged authorization and reports the complete failure list', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          forUpdateQuery([{ id: 'dept-1', name: '研发部', headId: 'head-z' }]),
        )
        .mockReturnValueOnce(
          forUpdateQuery([
            {
              employeeId: 'head-a',
              authorizationRoles: ['employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 1,
            },
            {
              employeeId: 'head-z',
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 4,
            },
          ]),
        )
        .mockReturnValueOnce(limitedQuery([{ id: 'dept-1' }]))
        .mockReturnValueOnce(limitedQuery([])),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const authorizationSyncService = syncedAuthorization();
    authorizationSyncService.stageAuthorizationChange
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5);
    authorizationSyncService.processEmployeeAuthorization
      .mockResolvedValueOnce({
        status: 'failed',
        version: 2,
        error: 'head-a failed',
      })
      .mockRejectedValueOnce(new Error('head-z transport failed'));
    const service = new (DepartmentService as any)(
      {
        transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      },
      {},
      adminRoleManager(),
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    let caught: any;
    try {
      await service.update(
        'dept-1',
        { name: '研发部', headId: 'head-a' },
        'operator-1',
      );
    } catch (error) {
      caught = error;
    }

    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenNthCalledWith(1, 'head-a', 2);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenNthCalledWith(2, 'head-z', 5);
    expect(caught?.getResponse()).toEqual({
      message: '部门负责人授权同步失败',
      failures: [
        {
          employeeId: 'head-a',
          version: 2,
          status: 'failed',
          error: 'head-a failed',
        },
        {
          employeeId: 'head-z',
          version: 5,
          status: 'rejected',
          error: 'head-z transport failed',
        },
      ],
    });
  });
});

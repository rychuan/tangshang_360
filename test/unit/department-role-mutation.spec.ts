import { ForbiddenException } from '@nestjs/common';
import { DepartmentService } from '../../server/modules/department/department.service';

function limitedQuery<T>(rows: T[]) {
  const query = {
    from: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn().mockResolvedValue(rows),
    for: jest.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
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

describe('department head role mutation', () => {
  it('requires built-in admin identity and permission_management edit before assigning a head', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('department query attempted');
      }),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      syncedAuthorization(),
    ) as DepartmentService;

    const request = service.create(
      {
        name: '研发部',
        headId: 'head-1',
      },
      'operator-1',
    );

    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).rejects.toThrow('无权修改部门负责人');

    expect(roleManagerService.getUserRoles).toHaveBeenCalledWith('operator-1');
    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'operator-1',
      'permission_management',
      'edit',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('stages dept_head role changes instead of mutating SDK inside a DB transaction', async () => {
    const departmentInsert = createDepartmentInsert();
    const auditInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(departmentInsert)
        .mockReturnValueOnce(auditInsert),
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'head-1',
            status: true,
            deletedAt: null,
            authorizationRoles: ['employee'],
            authorizationStatus: 'synced',
            authorizationVersion: 2,
          },
        ]),
      ),
    };
    let callbackActive = false;
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([])),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      ensureUserRoleStrict: jest.fn(() => {
        throw new Error('SDK mutation must not be called');
      }),
    };
    const authorizationSyncService = syncedAuthorization(3);
    authorizationSyncService.stageAuthorizationChange.mockImplementation(
      async () => {
        expect(callbackActive).toBe(true);
        return 3;
      },
    );
    authorizationSyncService.processEmployeeAuthorization.mockImplementation(
      async () => {
        expect(callbackActive).toBe(false);
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
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).resolves.toEqual({ id: 'dept-1' });

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-1', ['dept_head', 'employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('head-1', 3);
    expect(roleManagerService.ensureUserRoleStrict).not.toHaveBeenCalled();
  });

  it('stages old-head removal and new-head assignment from durable roles', async () => {
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      update: jest.fn().mockReturnValue({ set: updateSet }),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
      select: jest
        .fn()
        .mockReturnValueOnce(limitedQuery([]))
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'head-new',
              status: true,
              deletedAt: null,
              authorizationRoles: ['employee', 'supervisor'],
              authorizationStatus: 'synced',
              authorizationVersion: 4,
            },
            {
              employeeId: 'head-old',
              status: true,
              deletedAt: null,
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 7,
            },
          ]),
        ),
    };
    let callbackActive = false;
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            id: 'dept-1',
            oldHeadId: 'head-old',
            oldName: '研发部',
          },
        ]),
      ),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      removeUserRoleStrict: jest.fn(() => {
        throw new Error('SDK mutation must not be called');
      }),
      ensureUserRoleStrict: jest.fn(() => {
        throw new Error('SDK mutation must not be called');
      }),
    };
    const authorizationSyncService = syncedAuthorization();
    authorizationSyncService.stageAuthorizationChange
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(5);
    authorizationSyncService.processEmployeeAuthorization.mockImplementation(
      async (_employeeId: string, version: number) => {
        expect(callbackActive).toBe(false);
        return { status: 'synced', version };
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
      service.update(
        'dept-1',
        {
          name: '研发部',
          headId: 'head-new',
        },
        'operator-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenNthCalledWith(1, tx, 'head-new', [
      'dept_head',
      'employee',
      'supervisor',
    ]);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenNthCalledWith(2, tx, 'head-old', ['employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenNthCalledWith(1, 'head-new', 8);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenNthCalledWith(2, 'head-old', 5);
    expect(roleManagerService.removeUserRoleStrict).not.toHaveBeenCalled();
    expect(roleManagerService.ensureUserRoleStrict).not.toHaveBeenCalled();
  });

  it('does not stage authorization when the department head is unchanged', async () => {
    const tx = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      select: jest.fn(() => {
        throw new Error('authorization query attempted for unchanged head');
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            id: 'dept-1',
            oldHeadId: 'head-1',
            oldName: '研发部',
          },
        ]),
      ),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn(),
      checkUserPermission: jest.fn(),
    };
    const authorizationSyncService = syncedAuthorization();
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(
      service.update(
        'dept-1',
        {
          name: '新研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(roleManagerService.getUserRoles).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });

  it('removes the durable dept_head role when the new head is empty', async () => {
    const tx = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      select: jest
        .fn()
        .mockReturnValueOnce(limitedQuery([]))
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'head-old',
              status: true,
              deletedAt: null,
              authorizationRoles: ['dept_head', 'employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        ),
    };
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            id: 'dept-1',
            oldHeadId: 'head-old',
            oldName: '研发部',
          },
        ]),
      ),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
    };
    const authorizationSyncService = syncedAuthorization(3);
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await service.update(
      'dept-1',
      {
        name: '研发部',
        headId: '',
      },
      'operator-1',
    );

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-old', ['employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('head-old', 3);
  });

  it.each([
    {
      label: 'inactive',
      status: false,
      deletedAt: null,
    },
    {
      label: 'deleted',
      status: false,
      deletedAt: new Date('2026-01-01'),
    },
  ])(
    'keeps $label department heads fail closed through durable authorization processing',
    async ({ status, deletedAt }) => {
      const tx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(createDepartmentInsert())
          .mockReturnValueOnce({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        select: jest.fn().mockReturnValue(
          limitedQuery([
            {
              employeeId: 'head-1',
              status,
              deletedAt,
              authorizationRoles: ['employee'],
              authorizationStatus: 'synced',
              authorizationVersion: 2,
            },
          ]),
        ),
      };
      const db = {
        select: jest.fn().mockReturnValue(limitedQuery([])),
        transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const roleManagerService = {
        getUserRoles: jest.fn().mockResolvedValue(['admin']),
        checkUserPermission: jest.fn().mockResolvedValue(true),
        ensureUserRoleStrict: jest.fn(),
      };
      const authorizationSyncService = syncedAuthorization(3);
      const service = new (DepartmentService as any)(
        db,
        {},
        roleManagerService,
        globalScope(),
        authorizationSyncService,
      ) as DepartmentService;

      await service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      );

      expect(
        authorizationSyncService.stageAuthorizationChange,
      ).toHaveBeenCalledWith(tx, 'head-1', ['dept_head', 'employee']);
      expect(
        authorizationSyncService.processEmployeeAuthorization,
      ).toHaveBeenCalledWith('head-1', 3);
      expect(roleManagerService.ensureUserRoleStrict).not.toHaveBeenCalled();
    },
  );

  it('surfaces authorization sync failure after durable role staging', async () => {
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(createDepartmentInsert())
        .mockReturnValueOnce({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'head-1',
            status: true,
            deletedAt: null,
            authorizationRoles: ['employee'],
            authorizationStatus: 'synced',
            authorizationVersion: 2,
          },
        ]),
      ),
    };
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([])),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
    };
    const authorizationSyncService = syncedAuthorization(3);
    authorizationSyncService.processEmployeeAuthorization.mockResolvedValue({
      status: 'failed',
      version: 3,
      error: 'sdk unavailable',
    });
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      authorizationSyncService,
    ) as DepartmentService;

    await expect(
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).rejects.toThrow('sdk unavailable');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-1', ['dept_head', 'employee']);
  });

  it('requires role-management authority when deleting the final department-head assignment', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([{ id: 'dept-1', name: '研发部', headId: 'head-1' }]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(limitedQuery([])),
      delete: jest.fn(() => {
        throw new Error('department delete attempted');
      }),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      globalScope(),
      syncedAuthorization(),
    ) as DepartmentService;

    await expect(service.remove('dept-1', 'operator-1')).rejects.toThrow(
      '无权修改部门负责人',
    );

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'operator-1',
      'permission_management',
      'edit',
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('stages final-head removal in the delete transaction and processes it afterward', async () => {
    const tx = {
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'head-1',
            status: true,
            deletedAt: null,
            authorizationRoles: ['dept_head', 'employee'],
            authorizationStatus: 'synced',
            authorizationVersion: 2,
          },
        ]),
      ),
    };
    let callbackActive = false;
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([{ id: 'dept-1', name: '研发部', headId: 'head-1' }]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(limitedQuery([])),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      removeUserRoleStrict: jest.fn(() => {
        throw new Error('SDK mutation must not be called');
      }),
    };
    const authorizationSyncService = syncedAuthorization(3);
    authorizationSyncService.stageAuthorizationChange.mockImplementation(
      async () => {
        expect(callbackActive).toBe(true);
        return 3;
      },
    );
    authorizationSyncService.processEmployeeAuthorization.mockImplementation(
      async () => {
        expect(callbackActive).toBe(false);
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

    await expect(service.remove('dept-1', 'operator-1')).resolves.toEqual({
      success: true,
    });

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'head-1', ['employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('head-1', 3);
    expect(roleManagerService.removeUserRoleStrict).not.toHaveBeenCalled();
  });
});

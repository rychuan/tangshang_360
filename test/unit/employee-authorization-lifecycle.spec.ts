import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';
import { EmployeeAuthorizationService } from '../../server/modules/employee-management/employee-authorization.service';
import { TeamStructureService } from '../../server/modules/team-structure/team-structure.service';

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function countQuery(count: number) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([{ cnt: count }]),
  };
}

function orderedLimitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function createEmployeeService(db: Record<string, any>) {
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(['admin']),
    getUserRolesStrict: jest.fn().mockResolvedValue(['employee']),
    checkUserPermission: jest.fn().mockResolvedValue(false),
    syncUserRoles: jest.fn().mockResolvedValue(undefined),
    syncUserRolesStrict: jest.fn().mockResolvedValue(undefined),
  };
  const authorizationSyncService = {
    stageAuthorizationChange: jest.fn().mockResolvedValue(1),
    processEmployeeAuthorization: jest.fn().mockResolvedValue({
      status: 'synced',
      version: 1,
    }),
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
  const employeeAuthService = new EmployeeAuthorizationService(
    db as any,
    roleManagerService as any,
    authorizationSyncService as any,
    accessScopeService as any,
  );
  const service = new (EmployeeManagementService as any)(
    db,
    roleManagerService,
    {},
    accessScopeService,
    authorizationSyncService,
    employeeAuthService,
  ) as EmployeeManagementService;
  return {
    service,
    roleManagerService,
    accessScopeService,
    authorizationSyncService,
  };
}

function transactionWithAudit() {
  const updateQuery = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
  const auditInsert = {
    values: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {
    // acquireAdminAdvisoryLock 解构 [0]?.got_lock（pg_try_advisory_xact_lock AS got_lock）
    execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
    select: jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'employee-2',
          role: 'employee',
          status: true,
          authorizationRoles: ['employee'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    ),
    update: jest.fn().mockReturnValue(updateQuery),
    insert: jest.fn().mockReturnValue(auditInsert),
  };
  return { tx, updateQuery, auditInsert };
}

describe('employee authorization lifecycle', () => {
  it('requires permission_management edit in addition to admin identity for role changes', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValue(
          limitedQuery([{ employeeId: 'employee-2', role: 'employee' }]),
        ),
      transaction: jest.fn(() => {
        throw new Error('employee write attempted');
      }),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(
      service.update(
        'employee-2',
        {
          name: '员工二',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
          role: 'supervisor',
        },
        'admin-1',
      ),
    ).rejects.toThrow('无权修改员工角色');

    expect(roleManagerService.getUserRoles).toHaveBeenCalledWith('admin-1');
    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'admin-1',
      'permission_management',
      'edit',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires permission_management edit for non-employee roles on creation', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('employee creation queried');
      }),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(
      service.create(
        {
          id: 'employee-new',
          name: '新员工',
          position: '工程师',
          department: '研发部',
          role: 'hrd',
        },
        'admin-1',
      ),
    ).rejects.toThrow('无权修改员工角色');

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'admin-1',
      'permission_management',
      'edit',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('requires permission_management edit for legacy permission changes', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('permission target queried');
      }),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(
      service.updatePermissions(
        'employee-2',
        [{ resource: 'employees', actions: ['edit'] }],
        'admin-1',
      ),
    ).rejects.toThrow('无权修改员工权限');

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'admin-1',
      'permission_management',
      'edit',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('updates legacy permissions without reading admin counts or changing durable authorization state', async () => {
    const durableEmployee = {
      employeeId: 'employee-2',
      name: '管理员旧权限员工',
      role: 'admin',
      permissions: [],
      authorizationRoles: [],
      authorizationVersion: 7,
      authorizationStatus: 'synced',
      status: true,
      deletedAt: null,
    };
    const jobs = [
      {
        employeeId: 'employee-2',
        authorizationVersion: 7,
        status: 'succeeded',
      },
    ];
    const targetQuery = limitedQuery([durableEmployee]);
    const updateValues: Record<string, unknown>[] = [];
    const updateWhere = jest.fn().mockImplementation(async () => {
      durableEmployee.permissions = updateValues[0]?.permissions;
    });
    const tx = {
      update: jest.fn().mockReturnValue({
        set: jest.fn((values: Record<string, unknown>) => {
          updateValues.push(values);
          return { where: updateWhere };
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(targetQuery)
        .mockImplementation(() => {
          throw new Error('legacy admin count read');
        }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.updatePermissions(
      'employee-2',
      [{ resource: 'employees', actions: ['edit'] }],
      'admin-1',
    );

    expect(durableEmployee.permissions).toEqual([
      { resource: 'employees', actions: ['edit'] },
    ]);
    expect(durableEmployee.authorizationRoles).toEqual([]);
    expect(durableEmployee.authorizationVersion).toBe(7);
    expect(jobs).toEqual([
      {
        employeeId: 'employee-2',
        authorizationVersion: 7,
        status: 'succeeded',
      },
    ]);
    expect(updateValues).toEqual([
      { permissions: [{ resource: 'employees', actions: ['edit'] }] },
    ]);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted employee through create before staging stored roles', async () => {
    const { tx } = transactionWithAudit();
    const restoreWhere = jest.fn().mockResolvedValue(undefined);
    tx.update = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({ where: restoreWhere }),
    });
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            id: 'employee-restored',
            deletedAt: new Date('2026-01-01'),
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    const result = await service.create(
      {
        id: 'employee-restored',
        name: '恢复员工',
        position: '工程师',
        department: '研发部',
        role: 'supervisor',
      },
      'admin-1',
    );

    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalled();
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-restored', ['supervisor']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-restored', 1);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'employee-restored' });
  });

  it('applies role, status, and last-admin invariants atomically for imported employees', async () => {
    const { tx } = transactionWithAudit();
    tx.select = jest
      .fn()
      .mockReturnValueOnce(
        limitedQuery([
          {
            employeeId: 'admin-1',
            role: 'admin',
            status: true,
            authorizationRoles: ['admin'],
            authorizationStatus: 'synced',
            deletedAt: null,
          },
        ]),
      )
      .mockReturnValueOnce(countQuery(1));
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-1',
              role: 'admin',
              status: true,
              authorizationRoles: ['admin'],
              authorizationStatus: 'synced',
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService } = createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await expect(
      (service as any).syncImportedEmployee(
        'admin-1',
        {
          name: '唯一管理员',
          position: '负责人',
          positionCode: 'manager',
          department: '管理部',
          departmentId: 'dept-1',
          supervisorId: 'admin-1',
          role: 'employee',
        },
        false,
        'admin-1',
      ),
    ).rejects.toThrow('系统中至少保留一个系统管理员');

    expect(db.transaction).toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
  });

  it('leaves a demoted employee failed and unauthorized when SDK removal fails', async () => {
    const { tx, auditInsert } = transactionWithAudit();
    let transactionCallbackActive = false;
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'admin',
            status: true,
            authorizationRoles: ['admin'],
            authorizationStatus: 'synced',
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) => {
        transactionCallbackActive = true;
        try {
          return await callback(tx);
        } finally {
          transactionCallbackActive = false;
        }
      }),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);
    authorizationSyncService.processEmployeeAuthorization.mockResolvedValue({
      status: 'failed',
      version: 1,
      error: 'sdk import revoke failed',
    });

    await expect(
      service.syncImportedEmployee(
        'employee-2',
        {
          name: '员工二',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
          role: 'employee',
        },
        false,
        'admin-1',
      ),
    ).rejects.toThrow('sdk import revoke failed');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-2', 1);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
    expect(auditInsert.values).toHaveBeenCalled();
  });

  it('activates from current durable desired roles instead of audit snapshots', async () => {
    const { tx } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'employee-2',
          role: 'employee',
          status: false,
          authorizationRoles: ['employee', 'supervisor'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    );
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: false,
              authorizationRoles: ['employee', 'supervisor'],
            },
          ]),
        )
        .mockReturnValueOnce(orderedLimitedQuery([])),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.activate('employee-2', 'admin-1');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee', 'supervisor']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-2', 1);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('activates a durable empty role set without restoring the legacy admin role', async () => {
    const row = {
      employeeId: 'employee-2',
      role: 'admin',
      status: false,
      authorizationRoles: [],
      authorizationStatus: 'synced',
      deletedAt: null,
    };
    const { tx } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(limitedQuery([row]));
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([row])),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.activate('employee-2', 'admin-1');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', []);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-2', 1);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('treats repeated activation as an idempotent no-op', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: true,
              authorizationRoles: ['employee'],
            },
          ]),
        )
        .mockReturnValueOnce(orderedLimitedQuery([])),
      transaction: jest.fn(),
    };
    const { service, authorizationSyncService } = createEmployeeService(db);

    await expect(service.activate('employee-2', 'admin-1')).resolves.toEqual({
      success: true,
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });

  it('updates inactive desired roles without granting SDK roles', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: false,
            authorizationRoles: ['employee'],
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.update(
      'employee-2',
      {
        name: '员工二',
        position: '工程师',
        positionCode: 'engineer',
        department: '研发部',
        departmentId: 'dept-1',
        supervisorId: 'supervisor-1',
        role: 'supervisor',
      },
      'admin-1',
    );

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['supervisor']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-2', 1);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('does not restore roles from a stale deactivation audit snapshot', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: false,
              authorizationRoles: ['employee'],
            },
          ]),
        )
        .mockReturnValueOnce(
          orderedLimitedQuery([
            {
              changes: {
                before: {
                  status: true,
                  roleSnapshot: ['stale-role'],
                },
                after: { status: false },
              },
            },
          ]),
        ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);

    await service.activate('employee-2', 'admin-1');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee']);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it.each(['deactivate', 'delete'] as const)(
    'stages authorization after the employee database %s transaction commits',
    async (operation) => {
      const { tx } = transactionWithAudit();
      tx.select = jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee,supervisor',
            status: true,
            authorizationRoles: ['employee', 'supervisor'],
            authorizationStatus: 'synced',
            deletedAt: null,
          },
        ]),
      );
      let transactionCallbackActive = false;
      const db = {
        select: jest
          .fn()
          .mockReturnValueOnce(
            limitedQuery([
              {
                employeeId: 'employee-2',
                role: 'employee,supervisor',
                status: true,
                name: '员工二',
                authorizationRoles: ['employee', 'supervisor'],
                authorizationStatus: 'synced',
                position: '工程师',
                department: '研发部',
              },
            ]),
          )
          .mockReturnValueOnce(countQuery(2)),
        transaction: jest.fn(async (callback: (value: unknown) => unknown) => {
          transactionCallbackActive = true;
          try {
            return await callback(tx);
          } finally {
            transactionCallbackActive = false;
          }
        }),
      };
      const { service, roleManagerService, authorizationSyncService } =
        createEmployeeService(db);

      await service[operation]('employee-2', 'admin-1');

      expect(
        authorizationSyncService.stageAuthorizationChange,
      ).toHaveBeenCalledWith(tx, 'employee-2', ['employee', 'supervisor']);
      expect(
        authorizationSyncService.processEmployeeAuthorization,
      ).toHaveBeenCalledWith('employee-2', 1);
      expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
      expect(db.transaction.mock.invocationCallOrder[0]).toBeLessThan(
        authorizationSyncService.processEmployeeAuthorization.mock
          .invocationCallOrder[0],
      );
    },
  );

  it('propagates durable authorization failure after deactivation', async () => {
    const { tx, auditInsert } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'employee-2',
          role: 'employee',
          status: true,
          authorizationRoles: ['employee', 'custom-reviewer'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    );
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: true,
            authorizationRoles: ['employee', 'custom-reviewer'],
            authorizationStatus: 'synced',
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    authorizationSyncService.processEmployeeAuthorization.mockResolvedValue({
      status: 'failed',
      version: 1,
      error: 'sdk revoke failed',
    });

    await expect(service.deactivate('employee-2', 'admin-1')).rejects.toThrow(
      'sdk revoke failed',
    );

    expect(auditInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deactivate_employee',
        changes: expect.objectContaining({
          after: { status: false },
        }),
      }),
    );
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee', 'custom-reviewer']);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('does not overwrite the latest role snapshot when deactivation is repeated for an inactive employee', async () => {
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: false,
          },
        ]),
      ),
      transaction: jest.fn(),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);

    await expect(service.deactivate('employee-2', 'admin-1')).resolves.toEqual({
      success: true,
    });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.getUserRolesStrict).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });

  it('uses durable desired roles during imported activation', async () => {
    const { tx } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'employee-2',
          role: 'employee',
          status: false,
          authorizationRoles: ['employee', 'custom-reviewer'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    );
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: false,
              authorizationRoles: ['employee', 'custom-reviewer'],
            },
          ]),
        )
        .mockReturnValueOnce(
          orderedLimitedQuery([
            {
              changes: {
                before: {
                  status: true,
                  roleSnapshot: ['stale-role'],
                },
                after: { status: false },
              },
            },
          ]),
        ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.syncImportedEmployee(
      'employee-2',
      {
        name: '员工二',
        position: '工程师',
        positionCode: 'engineer',
        department: '研发部',
        departmentId: 'dept-1',
        supervisorId: 'supervisor-1',
        role: 'employee',
      },
      true,
      'admin-1',
    );

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee']);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('preserves durable custom roles when an imported update omits role', async () => {
    const row = {
      employeeId: 'employee-2',
      role: 'admin',
      status: false,
      authorizationRoles: ['custom-reviewer'],
      authorizationStatus: 'synced',
      deletedAt: null,
    };
    const { tx } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(limitedQuery([row]));
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([row])),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await service.syncImportedEmployee(
      'employee-2',
      {
        name: '员工二',
        position: '工程师',
        positionCode: 'engineer',
        department: '研发部',
        departmentId: 'dept-1',
        supervisorId: 'supervisor-1',
      },
      true,
      'admin-1',
    );

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['custom-reviewer']);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('propagates strict SDK revoke failure when deleting an employee', async () => {
    const { tx } = transactionWithAudit();
    tx.select = jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'employee-2',
          role: 'employee',
          status: true,
          authorizationRoles: ['employee'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    );
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: true,
              authorizationRoles: ['employee'],
              authorizationStatus: 'synced',
              name: '员工二',
              position: '工程师',
              department: '研发部',
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(2)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);
    authorizationSyncService.processEmployeeAuthorization.mockResolvedValue({
      status: 'failed',
      version: 1,
      error: 'sdk delete revoke failed',
    });

    await expect(service.delete('employee-2', 'admin-1')).rejects.toThrow(
      'sdk delete revoke failed',
    );
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('prevents deactivating the last active admin', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-1',
              role: 'admin',
              status: true,
              authorizationRoles: ['admin'],
              authorizationStatus: 'synced',
              deletedAt: null,
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback({
          // acquireAdminAdvisoryLock 解构 [0]?.got_lock（pg_try_advisory_xact_lock AS got_lock）
          execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
          select: jest.fn().mockReturnValue(
            limitedQuery([
              {
                employeeId: 'admin-1',
                role: 'admin',
                status: true,
                authorizationRoles: ['admin'],
                authorizationStatus: 'synced',
                deletedAt: null,
              },
            ]),
          ),
        }),
      ),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(service.deactivate('admin-1', 'admin-1')).rejects.toThrow(
      '系统中至少保留一个系统管理员',
    );
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('allows deleting an inactive admin when another active admin remains', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-inactive',
              role: 'admin',
              status: false,
              authorizationRoles: ['admin'],
              authorizationStatus: 'synced',
              deletedAt: null,
              name: '停用管理员',
              position: '管理员',
              department: '管理部',
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    tx.select = jest.fn().mockReturnValue(
      limitedQuery([
        {
          employeeId: 'admin-inactive',
          role: 'admin',
          status: false,
          authorizationRoles: ['admin'],
          authorizationStatus: 'synced',
          deletedAt: null,
        },
      ]),
    );
    const { service, roleManagerService, authorizationSyncService } =
      createEmployeeService(db);

    await expect(service.delete('admin-inactive', 'admin-1')).resolves.toEqual({
      success: true,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'admin-inactive', ['admin']);
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('revokes roles for every employee deactivated through the legacy batch path', async () => {
    const batchAuditValues = jest.fn().mockResolvedValue(undefined);
    let transactionCallbackActive = false;
    const tx = {
      // acquireAdminAdvisoryLock 解构 [0]?.got_lock（pg_try_advisory_xact_lock AS got_lock）
      execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            employeeId: 'employee-1',
            role: 'employee',
            status: true,
            authorizationRoles: ['employee', 'custom-employee-1'],
            authorizationStatus: 'synced',
            deletedAt: null,
          },
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: true,
            authorizationRoles: ['employee', 'custom-employee-2'],
            authorizationStatus: 'synced',
            deletedAt: null,
          },
        ]),
      }),
      insert: jest.fn().mockReturnValue({
        values: batchAuditValues,
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { employeeId: 'employee-1', role: 'employee', status: true },
          { employeeId: 'employee-2', role: 'employee', status: true },
        ]),
      }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) => {
        transactionCallbackActive = true;
        try {
          return await callback(tx);
        } finally {
          transactionCallbackActive = false;
        }
      }),
    };
    const roleManagerService = {
      getUserRolesStrict: jest
        .fn()
        .mockImplementation(async (employeeId: string) => [
          'employee',
          `custom-${employeeId}`,
        ]),
    };
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn().mockResolvedValue(1),
      processEmployeeAuthorization: jest.fn().mockImplementation(async () => {
        expect(transactionCallbackActive).toBe(false);
        return { status: 'synced', version: 1 };
      }),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      roleManagerService,
      accessScopeService,
      authorizationSyncService,
    ) as TeamStructureService;

    await service.batchDeactivate(['employee-1', 'employee-2'], 'admin-1');

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-1', ['employee', 'custom-employee-1']);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-2', ['employee', 'custom-employee-2']);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledTimes(2);
    expect(batchAuditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deactivate_employee',
        changes: expect.objectContaining({ after: { status: false } }),
      }),
    );
  });

  it('prevents the legacy batch path from deactivating the last active admin', async () => {
    const tx = {
      // acquireAdminAdvisoryLock 解构 [0]?.got_lock（pg_try_advisory_xact_lock AS got_lock）
      execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([
            {
              employeeId: 'admin-1',
              role: 'admin',
              status: true,
              authorizationRoles: ['admin'],
              authorizationStatus: 'synced',
              deletedAt: null,
            },
          ]),
        })
        .mockReturnValueOnce(countQuery(1)),
    };
    const db = {
      select: jest.fn().mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            employeeId: 'admin-1',
            role: 'admin',
            status: true,
            authorizationRoles: ['admin'],
            authorizationStatus: 'synced',
          },
        ]),
      }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRolesStrict: jest.fn().mockResolvedValue(['admin']),
    };
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn().mockResolvedValue(1),
      processEmployeeAuthorization: jest.fn().mockResolvedValue({
        status: 'synced',
        version: 1,
      }),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      roleManagerService,
      accessScopeService,
      authorizationSyncService,
    ) as TeamStructureService;

    await expect(
      service.batchDeactivate(['admin-1'], 'admin-1'),
    ).rejects.toThrow('系统中至少保留一个系统管理员');
    expect(db.transaction).toHaveBeenCalled();
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
  });

  it('counts and revokes only active employees actually handled by the legacy batch path', async () => {
    const tx = {
      // acquireAdminAdvisoryLock 解构 [0]?.got_lock（pg_try_advisory_xact_lock AS got_lock）
      execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            employeeId: 'employee-1',
            role: 'employee',
            status: true,
            authorizationRoles: ['employee'],
            authorizationStatus: 'synced',
            deletedAt: null,
          },
        ]),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest
          .fn()
          .mockResolvedValue([
            { employeeId: 'employee-1', role: 'employee', status: true },
          ]),
      }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRolesStrict: jest.fn().mockResolvedValue(['employee']),
    };
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn().mockResolvedValue(1),
      processEmployeeAuthorization: jest.fn().mockResolvedValue({
        status: 'synced',
        version: 1,
      }),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      roleManagerService,
      accessScopeService,
      authorizationSyncService,
    ) as TeamStructureService;

    const result = await service.batchDeactivate(
      ['employee-1', 'missing-employee'],
      'admin-1',
    );

    expect(result).toEqual({ success: true, deactivatedCount: 1 });
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).toHaveBeenCalledWith(tx, 'employee-1', ['employee']);
  });
});

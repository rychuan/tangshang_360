import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';
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
  return { service, roleManagerService, accessScopeService };
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
    update: jest.fn().mockReturnValue(updateQuery),
    insert: jest.fn().mockReturnValue(auditInsert),
  };
  return { tx, updateQuery, auditInsert };
}

describe('employee authorization lifecycle', () => {
  it('requires permission_management edit in addition to admin identity for role changes', async () => {
    const db = {
      select: jest.fn().mockReturnValue(
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

  it('restores a soft-deleted employee through create before syncing stored roles', async () => {
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
    const { service, roleManagerService } = createEmployeeService(db);
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
    expect(roleManagerService.syncUserRoles).toHaveBeenCalledWith(
      'employee-restored',
      ['supervisor'],
    );
    expect(result).toEqual({ id: 'employee-restored' });
  });

  it('applies role, status, and last-admin invariants atomically for imported employees', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'admin-1',
              role: 'admin',
              status: true,
            },
          ]),
        )
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(),
    };
    const { service, roleManagerService } = createEmployeeService(db);
    roleManagerService.checkUserPermission.mockResolvedValue(true);

    await expect(
      (service as any).syncImportedEmployee(
        'admin-1',
        {
          name: '唯一管理员',
          position: '负责人',
          department: '管理部',
          role: 'employee',
        },
        false,
        'admin-1',
      ),
    ).rejects.toThrow('系统中至少保留一个系统管理员');

    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
  });

  it('saves a fresh custom-role snapshot and strictly revokes roles for imported deactivation', async () => {
    const { tx, auditInsert } = transactionWithAudit();
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: true,
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService } = createEmployeeService(db);
    roleManagerService.getUserRolesStrict.mockResolvedValue([
      'employee',
      'custom-reviewer',
    ]);
    roleManagerService.syncUserRolesStrict.mockRejectedValue(
      new Error('sdk import revoke failed'),
    );

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

    expect(auditInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deactivate_employee',
        changes: {
          before: {
            status: true,
            roleSnapshot: ['employee', 'custom-reviewer'],
          },
          after: { status: false },
        },
      }),
    );
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      [],
    );
  });

  it('falls back to stored roles after activating an employee without a saved snapshot', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { employeeId: 'employee-2', role: 'employee,supervisor' },
          ]),
        )
        .mockReturnValueOnce(orderedLimitedQuery([])),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await service.activate('employee-2', 'admin-1');

    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      ['employee', 'supervisor'],
    );
    expect(db.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      roleManagerService.syncUserRolesStrict.mock.invocationCallOrder[0],
    );
  });

  it('restores the latest saved custom-role snapshot when activating an employee', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([{ employeeId: 'employee-2', role: 'employee' }]),
        )
        .mockReturnValueOnce(
          orderedLimitedQuery([
            {
              changes: {
                before: {
                  status: true,
                  roleSnapshot: ['employee', 'custom-reviewer'],
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
    const { service, roleManagerService } = createEmployeeService(db);

    await service.activate('employee-2', 'admin-1');

    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      ['employee', 'custom-reviewer'],
    );
  });

  it.each(['deactivate', 'delete'] as const)(
    'strictly revokes SDK roles during the employee database %s transaction',
    async (operation) => {
      const { tx } = transactionWithAudit();
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
      const { service, roleManagerService } = createEmployeeService(db);

      await service[operation]('employee-2', 'admin-1');

      expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
        'employee-2',
        [],
      );
      expect(db.transaction.mock.invocationCallOrder[0]).toBeLessThan(
        roleManagerService.syncUserRolesStrict.mock.invocationCallOrder[0],
      );
    },
  );

  it('saves fresh custom roles before deactivation and propagates strict SDK revoke failure', async () => {
    const { tx, auditInsert } = transactionWithAudit();
    const db = {
      select: jest.fn().mockReturnValue(
        limitedQuery([
          {
            employeeId: 'employee-2',
            role: 'employee',
            status: true,
          },
        ]),
      ),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const { service, roleManagerService } = createEmployeeService(db);
    roleManagerService.getUserRolesStrict.mockResolvedValue([
      'employee',
      'custom-reviewer',
    ]);
    roleManagerService.syncUserRolesStrict.mockRejectedValue(
      new Error('sdk revoke failed'),
    );

    await expect(
      service.deactivate('employee-2', 'admin-1'),
    ).rejects.toThrow('sdk revoke failed');

    expect(roleManagerService.getUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
    );
    expect(auditInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deactivate_employee',
        changes: {
          before: {
            status: true,
            roleSnapshot: ['employee', 'custom-reviewer'],
          },
          after: { status: false },
        },
      }),
    );
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      [],
    );
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
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(
      service.deactivate('employee-2', 'admin-1'),
    ).resolves.toEqual({ success: true });

    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.getUserRolesStrict).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      [],
    );
  });

  it('restores the latest custom-role snapshot during imported activation', async () => {
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
            },
          ]),
        )
        .mockReturnValueOnce(
          orderedLimitedQuery([
            {
              changes: {
                before: {
                  status: true,
                  roleSnapshot: ['employee', 'custom-reviewer'],
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
    const { service, roleManagerService } = createEmployeeService(db);

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

    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      ['employee', 'custom-reviewer'],
    );
  });

  it('propagates strict SDK revoke failure when deleting an employee', async () => {
    const { tx } = transactionWithAudit();
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              employeeId: 'employee-2',
              role: 'employee',
              status: true,
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
    const { service, roleManagerService } = createEmployeeService(db);
    roleManagerService.syncUserRolesStrict.mockRejectedValue(
      new Error('sdk delete revoke failed'),
    );

    await expect(service.delete('employee-2', 'admin-1')).rejects.toThrow(
      'sdk delete revoke failed',
    );
  });

  it('prevents deactivating the last active admin', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { employeeId: 'admin-1', role: 'admin', status: true },
          ]),
        )
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(),
    };
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(service.deactivate('admin-1', 'admin-1')).rejects.toThrow(
      '系统中至少保留一个系统管理员',
    );
    expect(db.transaction).not.toHaveBeenCalled();
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
    const { service, roleManagerService } = createEmployeeService(db);

    await expect(
      service.delete('admin-inactive', 'admin-1'),
    ).resolves.toEqual({ success: true });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'admin-inactive',
      [],
    );
  });

  it('revokes roles for every employee deactivated through the legacy batch path', async () => {
    const batchAuditValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockReturnValue({
        values: batchAuditValues,
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { employeeId: 'employee-1', role: 'employee' },
          { employeeId: 'employee-2', role: 'employee' },
        ]),
      }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRolesStrict: jest
        .fn()
        .mockImplementation(async (employeeId: string) => [
          'employee',
          `custom-${employeeId}`,
        ]),
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

    await service.batchDeactivate(
      ['employee-1', 'employee-2'],
      'admin-1',
    );

    expect(roleManagerService.getUserRolesStrict).toHaveBeenCalledTimes(2);
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledTimes(2);
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-1',
      [],
    );
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-2',
      [],
    );
    expect(db.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      roleManagerService.syncUserRolesStrict.mock.invocationCallOrder[0],
    );
    expect(batchAuditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deactivate_employee',
        changes: expect.objectContaining({
          before: expect.objectContaining({
            roleSnapshot: expect.arrayContaining([
              'employee',
              expect.stringContaining('custom-'),
            ]),
          }),
        }),
      }),
    );
  });

  it('prevents the legacy batch path from deactivating the last active admin', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([
            { employeeId: 'admin-1', role: 'admin' },
          ]),
        })
        .mockReturnValueOnce(countQuery(1)),
      transaction: jest.fn(),
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

    await expect(
      service.batchDeactivate(['admin-1'], 'admin-1'),
    ).rejects.toThrow('系统中至少保留一个系统管理员');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRolesStrict).not.toHaveBeenCalled();
  });

  it('counts and revokes only active employees actually handled by the legacy batch path', async () => {
    const tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          { employeeId: 'employee-1', role: 'employee' },
        ]),
      }),
      transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRolesStrict: jest.fn().mockResolvedValue(['employee']),
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

    const result = await service.batchDeactivate(
      ['employee-1', 'missing-employee'],
      'admin-1',
    );

    expect(result).toEqual({ success: true, deactivatedCount: 1 });
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledTimes(1);
    expect(roleManagerService.syncUserRolesStrict).toHaveBeenCalledWith(
      'employee-1',
      [],
    );
  });
});

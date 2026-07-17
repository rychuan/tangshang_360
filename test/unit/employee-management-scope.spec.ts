import { sql } from 'drizzle-orm';
import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';

describe('employee management access scope', () => {
  const createService = (items: Record<string, unknown>[] = []) => {
    const itemQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue(items),
    };
    const countQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ count: 0 }]),
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(itemQuery)
        .mockReturnValueOnce(countQuery),
    };
    const roleManagerService = {
      checkUserPermission: jest.fn().mockResolvedValue(false),
      getUserRoles: jest.fn().mockResolvedValue(['custom-role']),
      syncUserRoles: jest.fn().mockResolvedValue(undefined),
    };
    const bindingService = {
      history: jest.fn().mockResolvedValue({ items: [] }),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`TRUE`),
      canAccessEmployee: jest.fn().mockResolvedValue(true),
      getScope: jest.fn().mockResolvedValue({
        kind: 'self',
        roles: ['custom-role'],
        departmentIds: [],
        subordinateIds: [],
      }),
    };
    const service = new (EmployeeManagementService as any)(
      db,
      roleManagerService,
      bindingService,
      accessScopeService,
    ) as EmployeeManagementService;

    return {
      service,
      db,
      roleManagerService,
      bindingService,
      accessScopeService,
    };
  };

  it('adds the current user scope condition to employee list queries', async () => {
    const { service, accessScopeService } = createService();

    await (service.list as any)({ page: 1, pageSize: 20 }, 'manager-1');

    expect(accessScopeService.buildEmployeeScopeCondition).toHaveBeenCalledWith(
      'manager-1',
      { includeSelf: true },
    );
  });

  it('rejects employee detail outside the current user scope before querying', async () => {
    const { service, db, accessScopeService } = createService();
    accessScopeService.canAccessEmployee.mockResolvedValue(false);
    db.select.mockImplementation(() => {
      throw new Error('employee detail queried before scope check');
    });

    await expect(
      (service.detail as any)('employee-2', 'manager-1'),
    ).rejects.toThrow('无权查看该员工');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects binding history outside the current user scope', async () => {
    const { service, bindingService, accessScopeService } = createService();
    accessScopeService.canAccessEmployee.mockResolvedValue(false);

    await expect(
      (service.bindingHistory as any)('employee-2', 'manager-1'),
    ).rejects.toThrow('无权查看该员工');
    expect(bindingService.history).not.toHaveBeenCalled();
  });

  it('does not query or expose current bindings without binding view permission', async () => {
    const { service, db, roleManagerService } = createService([
      {
        id: 'employee-1',
        employeeNo: 'E001',
        name: '员工一',
        position: '工程师',
        title: '',
        role: 'employee',
        department: '研发部',
        supervisorId: '',
        status: true,
        phone: '',
        hireDate: '',
        supervisorName: '',
        bitableConnectionId: null,
      },
    ]);

    const result = await service.list(
      { page: 1, pageSize: 20 },
      'supervisor-1',
    );

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'supervisor-1',
      'employee_binding',
      'view',
    );
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(result.items[0].currentBinding).toBeUndefined();
  });

  it('rejects binding filters without binding view permission', async () => {
    const { service, db } = createService();

    await expect(
      service.list({ page: 1, pageSize: 20, binding: 'bound' }, 'supervisor-1'),
    ).rejects.toThrow('无权筛选员工绑定状态');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('does not query or expose active binding counts in employee detail', async () => {
    const detailQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          employeeId: 'employee-1',
          employeeNo: 'E001',
          name: '员工一',
          position: '工程师',
          title: '',
          role: 'employee',
          department: '研发部',
          supervisorId: '',
          status: true,
          phone: '',
          hireDate: '',
          probationMonths: 3,
          createdAt: new Date('2026-01-01'),
          supervisorName: '',
        },
      ]),
    };
    const countQuery = () => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
    });
    const avgQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ avgVal: null }]),
    };
    const latestQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(detailQuery)
        .mockReturnValueOnce(countQuery())
        .mockReturnValueOnce(countQuery())
        .mockReturnValueOnce(avgQuery)
        .mockReturnValueOnce(latestQuery),
    };
    const roleManagerService = {
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (EmployeeManagementService as any)(
      db,
      roleManagerService,
      {},
      accessScopeService,
    ) as EmployeeManagementService;

    const result = await service.detail('employee-1', 'supervisor-1');

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'supervisor-1',
      'employee_binding',
      'view',
    );
    expect(db.select).toHaveBeenCalledTimes(5);
    expect(result.stats.activeBindings).toBeUndefined();
  });

  it.each([
    ['update', (service: EmployeeManagementService) =>
      (service.update as any)(
        'employee-2',
        {
          name: '员工二',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
        },
        'manager-1',
      )],
    ['delete', (service: EmployeeManagementService) =>
      (service.delete as any)('employee-2', 'manager-1')],
    ['activate', (service: EmployeeManagementService) =>
      (service.activate as any)('employee-2', 'manager-1')],
    ['deactivate', (service: EmployeeManagementService) =>
      (service.deactivate as any)('employee-2', 'manager-1')],
  ])(
    'rejects an out-of-scope employee %s before loading or mutating the target',
    async (_operation, invoke) => {
      const { service, db, accessScopeService } = createService();
      accessScopeService.canAccessEmployee.mockResolvedValue(false);
      db.select.mockImplementation(() => {
        throw new Error('target employee loaded before scope check');
      });

      await expect(invoke(service)).rejects.toThrow('无权操作该员工');
      expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
        'manager-1',
        'employee-2',
        { includeSelf: true },
      );
      expect(db.select).not.toHaveBeenCalled();
    },
  );

  it('rejects a self-scoped custom role attempting to elevate its own role', async () => {
    const { service, db, roleManagerService } = createService();
    const targetQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        { id: 'employee-1', role: 'employee' },
      ]),
    };
    db.select.mockReset().mockReturnValue(targetQuery);
    db.transaction = jest.fn();

    await expect(
      (service.update as any)(
        'employee-1',
        {
          name: '员工一',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
          role: 'admin',
        },
        'employee-1',
      ),
    ).rejects.toThrow('只有系统管理员可修改员工角色');

    expect(roleManagerService.getUserRoles).toHaveBeenCalledWith('employee-1');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
  });

  it('requires the built-in admin identity before legacy employee permissions change', async () => {
    const { service, db, accessScopeService, roleManagerService } =
      createService();
    accessScopeService.canAccessEmployee.mockResolvedValue(true);
    db.select.mockImplementation(() => {
      throw new Error('permissions target loaded before identity check');
    });

    await expect(
      (service.updatePermissions as any)(
        'employee-1',
        [{ resource: 'employees', actions: ['edit'] }],
        'employee-1',
      ),
    ).rejects.toThrow('只有系统管理员可修改员工权限');

    expect(roleManagerService.getUserRoles).toHaveBeenCalledWith('employee-1');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('requires global data scope before creating a new employee', async () => {
    const { service, db } = createService();
    db.select.mockImplementation(() => {
      throw new Error('employee creation queried before global scope check');
    });

    await expect(
      (service.create as any)(
        {
          id: 'employee-new',
          name: '新员工',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
        },
        'manager-1',
      ),
    ).rejects.toThrow('只有全局范围用户可创建员工');

    expect(db.select).not.toHaveBeenCalled();
  });

  it('keeps employee creation available to global scope', async () => {
    const existingQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const employeeInsert = {
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'employee-new' }]),
      }),
    };
    const auditInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(employeeInsert)
        .mockReturnValueOnce(auditInsert),
    };
    const { service, db, accessScopeService, roleManagerService } =
      createService();
    db.select.mockReturnValue(existingQuery);
    db.transaction = jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(tx),
    );
    accessScopeService.getScope.mockResolvedValue({
      kind: 'global',
      roles: ['hrd'],
      departmentIds: [],
      subordinateIds: [],
    });

    await expect(
      (service.create as any)(
        {
          id: 'employee-new',
          name: '新员工',
          position: '工程师',
          positionCode: 'engineer',
          department: '研发部',
          departmentId: 'dept-1',
          supervisorId: 'supervisor-1',
        },
        'hrd-1',
      ),
    ).resolves.toEqual({ id: 'employee-new' });

    expect(accessScopeService.getScope).toHaveBeenCalledWith('hrd-1');
    expect(roleManagerService.syncUserRoles).toHaveBeenCalledWith(
      'employee-new',
      ['employee'],
    );
  });
});

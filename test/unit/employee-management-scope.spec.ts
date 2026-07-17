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
    };
    const bindingService = {
      history: jest.fn().mockResolvedValue({ items: [] }),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`TRUE`),
      canAccessEmployee: jest.fn().mockResolvedValue(true),
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
});

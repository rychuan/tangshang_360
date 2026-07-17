import { sql } from 'drizzle-orm';
import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';

describe('employee management access scope', () => {
  const createService = () => {
    const itemQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
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
    const roleManagerService = {};
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
});

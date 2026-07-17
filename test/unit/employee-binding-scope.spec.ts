import { EmployeeBindingService } from '../../server/modules/employee-management/employee-binding.service';

describe('employee binding access scope', () => {
  it('rejects binding an out-of-scope employee before loading templates or mutating bindings', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('binding queried before scope check');
      }),
    };
    const snapshotService = {};
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (EmployeeBindingService as any)(
      db,
      snapshotService,
      accessScopeService,
    ) as EmployeeBindingService;

    await expect(
      service.batchBind(['employee-2'], 'template-1', '2026-07', 'manager-1'),
    ).rejects.toThrow('无权操作该员工');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects unbinding by binding id when its employee is out of scope', async () => {
    const bindingQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { id: 'binding-1', employeeId: 'employee-2', status: true },
      ]),
    };
    const db = {
      select: jest.fn().mockReturnValue(bindingQuery),
      transaction: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (EmployeeBindingService as any)(
      db,
      {},
      accessScopeService,
    ) as EmployeeBindingService;

    await expect(
      service.unbindById('binding-1', 'manager-1'),
    ).rejects.toThrow('无权操作该员工');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

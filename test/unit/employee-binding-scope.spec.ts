import { EmployeeBindingService } from '../../server/modules/employee-management/employee-binding.service';

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function whereQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

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

  it('rejects binding an inactive employee before binding, audit, or snapshot side effects', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([{ id: 'template-1', isActive: true }]),
        )
        .mockReturnValueOnce(
          limitedQuery([{ id: 'employee-1', status: false }]),
        )
        .mockImplementation(() => {
          throw new Error('binding queried for inactive employee');
        }),
      transaction: jest.fn(),
    };
    const snapshotService = {
      deleteSnapshot: jest.fn(),
      generateFromTemplate: jest.fn(),
      hasSnapshot: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (EmployeeBindingService as any)(
      db,
      snapshotService,
      accessScopeService,
    ) as EmployeeBindingService;

    await expect(
      service.bind(
        'employee-1',
        'template-1',
        '2026-07',
        'manager-1',
      ),
    ).rejects.toThrow('员工 employee-1 已停用，无法绑定考核模板');

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(snapshotService.deleteSnapshot).not.toHaveBeenCalled();
    expect(snapshotService.generateFromTemplate).not.toHaveBeenCalled();
    expect(snapshotService.hasSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a batch containing an inactive employee before any binding, audit, or snapshot side effect', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([{ id: 'template-1', isActive: true }]),
        )
        .mockReturnValueOnce(
          whereQuery([
            { employeeId: 'employee-1', status: true },
            { employeeId: 'employee-2', status: false },
          ]),
        )
        .mockImplementation(() => {
          throw new Error('binding queried for inactive employee batch');
        }),
      transaction: jest.fn(),
    };
    const snapshotService = {
      deleteSnapshot: jest.fn(),
      generateFromTemplate: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (EmployeeBindingService as any)(
      db,
      snapshotService,
      accessScopeService,
    ) as EmployeeBindingService;

    await expect(
      service.batchBind(
        ['employee-1', 'employee-2'],
        'template-1',
        '2026-07',
        'manager-1',
      ),
    ).rejects.toThrow('员工已停用，无法绑定考核模板：employee-2');

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(snapshotService.deleteSnapshot).not.toHaveBeenCalled();
    expect(snapshotService.generateFromTemplate).not.toHaveBeenCalled();
  });
});

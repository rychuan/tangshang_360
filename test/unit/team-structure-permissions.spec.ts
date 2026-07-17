import 'reflect-metadata';

const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Post: noopDecorator,
    Patch: noopDecorator,
    Param: noopDecorator,
    Query: noopDecorator,
    Body: noopDecorator,
    Req: noopDecorator,
  };
});

jest.mock('@lark-apaas/fullstack-nestjs-core', () => {
  const actual = jest.requireActual('@lark-apaas/fullstack-nestjs-core');
  return {
    ...actual,
    NeedLogin: noopDecorator,
    CanRole: noopDecorator,
  };
});

import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { TeamStructureController } from '../../server/modules/team-structure/team-structure.controller';
import { TeamStructureService } from '../../server/modules/team-structure/team-structure.service';

describe('team structure permission enforcement', () => {
  it.each([
    ['list', 'employees', 'view'],
    ['create', 'employee_binding', 'edit'],
    ['batchDeactivate', 'employees', 'edit'],
    ['getEmployee', 'employees', 'view'],
    ['updateEmployee', 'employees', 'edit'],
    ['deactivate', 'employee_binding', 'edit'],
    ['history', 'employee_binding', 'view'],
  ] as const)('maps %s to %s:%s', (method, resource, action) => {
    expect(
      Reflect.getMetadata(
        PERMISSION_META_KEY,
        TeamStructureController.prototype[method],
      ),
    ).toEqual({ resource, action });
  });

  it('rejects mixed employee and binding lists without binding view permission', async () => {
    const db = { select: jest.fn() };
    const roleManagerService = {
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn(),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      roleManagerService,
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.list({ page: '1', pageSize: '10' }, 'supervisor-1'),
    ).rejects.toThrow('无权查看员工绑定信息');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('checks employee scope before returning binding detail or history', async () => {
    const db = { select: jest.fn() };
    const bindingService = { history: jest.fn() };
    const roleManagerService = {
      checkUserPermission: jest.fn().mockResolvedValue(true),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (TeamStructureService as any)(
      db,
      bindingService,
      roleManagerService,
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.getEmployee('employee-2', 'supervisor-1'),
    ).rejects.toThrow('无权查看该员工');
    await expect(service.history('employee-2', 'supervisor-1')).rejects.toThrow(
      '无权查看该员工',
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(bindingService.history).not.toHaveBeenCalled();
  });

  it('rejects legacy employee updates outside the current scope before writing', async () => {
    const db = { transaction: jest.fn() };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      {},
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.updateEmployee(
        'employee-2',
        { name: '越权更新' },
        'manager-1',
      ),
    ).rejects.toThrow('无权操作该员工');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: true },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a batch deactivate request containing an out-of-scope employee', async () => {
    const db = { transaction: jest.fn() };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      {},
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.batchDeactivate(['employee-2'], 'manager-1'),
    ).rejects.toThrow('无权操作该员工');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: true },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does not accept the legacy role field in a team-structure employee update', async () => {
    const updateQuery = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    const auditInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      update: jest.fn().mockReturnValue(updateQuery),
      insert: jest.fn().mockReturnValue(auditInsert),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      {},
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.updateEmployee(
        'employee-1',
        { name: '员工一', role: 'admin' },
        'manager-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(updateQuery.set).toHaveBeenCalledWith({ name: '员工一' });
  });

  it('does not accept the legacy status field in a team-structure employee update', async () => {
    const updateQuery = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    const auditInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      update: jest.fn().mockReturnValue(updateQuery),
      insert: jest.fn().mockReturnValue(auditInsert),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (TeamStructureService as any)(
      db,
      {},
      {},
      accessScopeService,
    ) as TeamStructureService;

    await expect(
      service.updateEmployee(
        'employee-1',
        { name: '员工一', status: false },
        'manager-1',
      ),
    ).resolves.toEqual({ success: true });

    expect(updateQuery.set).toHaveBeenCalledWith({ name: '员工一' });
  });
});

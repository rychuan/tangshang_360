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
});

import 'reflect-metadata';

const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Post: noopDecorator,
    Put: noopDecorator,
    Patch: noopDecorator,
    Delete: noopDecorator,
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
import { EmployeeManagementController } from '../../server/modules/employee-management/employee-management.controller';

describe('employee binding template reference permission', () => {
  it('requires employee binding edit permission', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      (EmployeeManagementController.prototype as any).bindingTemplates,
    );

    expect(metadata).toEqual({
      resource: 'employee_binding',
      action: 'edit',
    });
  });
});

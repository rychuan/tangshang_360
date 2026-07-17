import 'reflect-metadata';

const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Req: noopDecorator,
  };
});

jest.mock('@lark-apaas/fullstack-nestjs-core', () => {
  const actual = jest.requireActual('@lark-apaas/fullstack-nestjs-core');
  return {
    ...actual,
    CanRole: noopDecorator,
  };
});

import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { AssessmentDashboardController } from '../../server/modules/assessment-dashboard/assessment-dashboard.controller';
import { dashboardEmployeeIds } from '../../server/modules/assessment-dashboard/assessment-dashboard.service';
import { DEFAULT_PERMISSIONS } from '../../shared/types/permission.types';

describe('dashboard permission enforcement', () => {
  it.each(['todos', 'overview'] as const)(
    'requires dashboard view permission for %s',
    (method) => {
      const metadata = Reflect.getMetadata(
        PERMISSION_META_KEY,
        AssessmentDashboardController.prototype[method],
      );
      expect(metadata).toEqual({ resource: 'dashboard', action: 'view' });
    },
  );

  it('grants dashboard view permission to every built-in role', () => {
    const builtInRoles = [
      'admin',
      'hrd',
      'dept_head',
      'supervisor',
      'employee',
    ];

    for (const role of builtInRoles) {
      expect(DEFAULT_PERMISSIONS[role]).toContainEqual({
        resource: 'dashboard',
        actions: ['view'],
      });
    }
  });

  it('keeps global scope unfiltered', () => {
    expect(
      dashboardEmployeeIds(
        {
          kind: 'global',
          roles: ['hrd'],
          departmentIds: [],
          subordinateIds: [],
        },
        'user-1',
        [],
      ),
    ).toBeNull();
  });

  it('uses managed employee ids for department heads and supervisors', () => {
    expect(
      dashboardEmployeeIds(
        {
          kind: 'managed',
          roles: ['dept_head'],
          departmentIds: ['dept-1'],
          subordinateIds: ['user-2'],
        },
        'user-1',
        ['user-2', 'user-3'],
      ),
    ).toEqual(['user-2', 'user-3']);
  });

  it('uses self for self-scoped users', () => {
    expect(
      dashboardEmployeeIds(
        {
          kind: 'self',
          roles: ['employee'],
          departmentIds: [],
          subordinateIds: [],
        },
        'user-1',
        [],
      ),
    ).toEqual(['user-1']);
  });
});

import 'reflect-metadata';
import { and, eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

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
import {
  AssessmentDashboardService,
  dashboardEmployeeIds,
} from '../../server/modules/assessment-dashboard/assessment-dashboard.service';
import { assessmentInstance } from '../../server/database/schema';
import { buildEmployeeIdInCondition } from '../../server/modules/team-performance/employee-scope-condition';
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

  it('uses AccessScopeService managed IDs for dashboard todos', async () => {
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    };
    const db = {
      select: jest.fn().mockReturnValue(query),
    };
    const employeeRepo = {
      findSubordinateIds: jest.fn(() => {
        throw new Error('dashboard todos must not infer subordinate IDs');
      }),
    };
    const accessScopeService = {
      getManagedEmployeeIds: jest
        .fn()
        .mockResolvedValue(['managed-1', 'managed-2']),
    };
    const service = new (AssessmentDashboardService as any)(
      db,
      employeeRepo,
      accessScopeService,
    ) as AssessmentDashboardService;

    await expect(service.todos('manager-1')).resolves.toEqual({ items: [] });

    expect(accessScopeService.getManagedEmployeeIds).toHaveBeenCalledWith(
      'manager-1',
    );
    expect(employeeRepo.findSubordinateIds).not.toHaveBeenCalled();
  });

  it('compiles multi-employee dashboard scope as a grouped IN predicate', () => {
    const condition = and(
      buildEmployeeIdInCondition(assessmentInstance.employeeId, [
        'managed-1',
        'managed-2',
      ]),
      eq(assessmentInstance.status, 'completed'),
    );
    const compiled = new PgDialect().sqlToQuery(condition!);
    const normalizedSql = compiled.sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedSql).toContain('user_id in ($1, $2)');
    expect(normalizedSql).toContain('and "assessment_instance"."status" = $3');
    expect(normalizedSql).not.toContain('user_id = $1 or');
    expect(compiled.params).toEqual(['managed-1', 'managed-2', 'completed']);
  });

  it('uses the grouped managed predicate for mixed todo statuses', async () => {
    let whereCondition: unknown;
    const sampleRows = [
      {
        id: 'self-review',
        employeeId: 'manager-1',
        period: '2026-07',
        status: 'self_review',
      },
      {
        id: 'managed-review',
        employeeId: 'managed-1',
        period: '2026-07',
        status: 'supervisor_review',
      },
      {
        id: 'managed-sign',
        employeeId: 'managed-2',
        period: '2026-07',
        status: 'supervisor_sign',
      },
      {
        id: 'managed-wrong-status',
        employeeId: 'managed-1',
        period: '2026-07',
        status: 'self_review',
      },
      {
        id: 'outsider-review',
        employeeId: 'outsider-1',
        period: '2026-07',
        status: 'supervisor_review',
      },
    ];
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn((condition: unknown) => {
        whereCondition = condition;
        return query;
      }),
      orderBy: jest
        .fn()
        .mockImplementation(async () =>
          sampleRows
            .filter(
              (row) =>
                (row.employeeId === 'manager-1' &&
                  ['self_review', 'pending_sign'].includes(row.status)) ||
                (['managed-1', 'managed-2'].includes(row.employeeId) &&
                  ['supervisor_review', 'supervisor_sign'].includes(
                    row.status,
                  )),
            )
            .map(({ employeeId: _employeeId, ...row }) => row),
        ),
    };
    const service = new (AssessmentDashboardService as any)(
      { select: jest.fn().mockReturnValue(query) },
      {},
      {
        getManagedEmployeeIds: jest
          .fn()
          .mockResolvedValue(['managed-1', 'managed-2']),
      },
    ) as AssessmentDashboardService;

    const result = await service.todos('manager-1');
    const compiled = new PgDialect().sqlToQuery(whereCondition as any);
    const normalizedSql = compiled.sql.replace(/\s+/g, ' ').toLowerCase();

    expect(normalizedSql).toContain('user_id in (');
    expect(result.items.map((item) => item.id)).toEqual([
      'self-review',
      'managed-review',
      'managed-sign',
    ]);
  });
});

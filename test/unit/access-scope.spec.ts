import {
  AccessScopeService,
  classifyAccessScope,
} from '../../server/common/access/access-scope.service';
import { RoleManagerService } from '../../server/modules/role-manager/role-manager.service';
import { QueryBackedDb, type FakeEmployeeRow } from './query-fakes';

function createEmployeeRow(
  overrides: Partial<FakeEmployeeRow> = {},
): FakeEmployeeRow {
  return {
    employeeId: 'employee-1',
    status: true,
    deletedAt: null,
    authorizationStatus: 'synced',
    authorizationRoles: ['employee'],
    authorizationVersion: 1,
    supervisorId: null,
    departmentId: 'dept-a',
    ...overrides,
  };
}

function createAuthzSdk(rolesByUser: Record<string, string[]>) {
  const knownRoles = new Set(Object.values(rolesByUser).flat());
  return {
    roles: {
      list: jest.fn().mockResolvedValue([...knownRoles].map((bizID) => ({ bizID }))),
    },
    members: {
      list: jest.fn(async (roleBizId: string) => {
        const userList = Object.entries(rolesByUser)
          .filter(([, roles]) => roles.includes(roleBizId))
          .map(([userID]) => ({ userID }));
        return { members: { userList }, hasMore: false };
      }),
    },
  };
}

function createServices(options: {
  employees: FakeEmployeeRow[];
  departments?: Array<{ id: string; headId: string | null; isActive: boolean }>;
  rolesByUser: Record<string, string[]>;
}) {
  const db = new QueryBackedDb({
    employees: options.employees,
    departments: options.departments,
  });
  const authzSDK = createAuthzSdk(options.rolesByUser);
  const roleManagerService = new (RoleManagerService as any)(
    db,
    authzSDK,
  ) as RoleManagerService;
  const accessScopeService = new (AccessScopeService as any)(
    db,
    roleManagerService,
  ) as AccessScopeService;

  return { db, authzSDK, roleManagerService, accessScopeService };
}

describe('classifyAccessScope', () => {
  it('treats admin and hrd as global access', () => {
    expect(classifyAccessScope(['admin'], false, false)).toBe('global');
    expect(classifyAccessScope(['hrd'], false, false)).toBe('global');
  });

  it('treats department heads and supervisors as managed access', () => {
    expect(classifyAccessScope(['dept_head'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], true, false)).toBe('managed');
    expect(classifyAccessScope(['supervisor'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], false, true)).toBe('managed');
  });

  it('falls back to self access for regular employees', () => {
    expect(classifyAccessScope(['employee'], false, false)).toBe('self');
    expect(classifyAccessScope([], false, false)).toBe('self');
  });
});

describe('AccessScopeService', () => {
  it.each([
    {
      label: 'inactive',
      employee: createEmployeeRow({ status: false }),
    },
    {
      label: 'deleted',
      employee: createEmployeeRow({
        deletedAt: new Date('2026-07-18T00:00:00Z'),
      }),
    },
  ] as const)('fails closed for %s target employees', async ({ employee }) => {
    const { accessScopeService, authzSDK } = createServices({
      employees: [employee],
      rolesByUser: {
        [employee.employeeId]: ['admin'],
      },
    });

    await expect(accessScopeService.getScope(employee.employeeId)).resolves.toEqual(
      {
        kind: 'self',
        roles: [],
        departmentIds: [],
        subordinateIds: [],
      },
    );

    expect(authzSDK.roles.list).not.toHaveBeenCalled();
    expect(authzSDK.members.list).not.toHaveBeenCalled();
  });

  it('excludes pending subordinates from a synced supervisor scope and managed collections', async () => {
    const manager = createEmployeeRow({
      employeeId: 'manager-1',
      authorizationRoles: ['supervisor', 'employee'],
      departmentId: 'dept-a',
    });
    const syncedSubordinate = createEmployeeRow({
      employeeId: 'sub-synced',
      supervisorId: 'manager-1',
      authorizationRoles: ['employee'],
      departmentId: 'dept-a',
    });
    const pendingSubordinate = createEmployeeRow({
      employeeId: 'sub-pending',
      supervisorId: 'manager-1',
      authorizationStatus: 'pending',
      authorizationRoles: ['employee'],
      departmentId: 'dept-a',
    });

    const { accessScopeService } = createServices({
      employees: [manager, syncedSubordinate, pendingSubordinate],
      rolesByUser: {
        'manager-1': ['supervisor', 'employee'],
        'sub-synced': ['employee'],
        'sub-pending': ['employee'],
      },
    });

    await expect(accessScopeService.getScope('manager-1')).resolves.toEqual({
      kind: 'managed',
      roles: ['supervisor', 'employee'],
      departmentIds: [],
      subordinateIds: ['sub-synced', 'sub-pending'],
    });

    const condition = await accessScopeService.buildEmployeeScopeCondition(
      'manager-1',
      { includeSelf: false },
    );
    expect(condition).not.toBeNull();
    await expect(
      accessScopeService.getManagedEmployeeIds('manager-1', {
        includeSelf: false,
      }),
    ).resolves.toEqual(['sub-synced', 'sub-pending']);
    await expect(
      accessScopeService.canAccessEmployee('manager-1', 'sub-pending'),
    ).resolves.toBe(true);
    await expect(
      accessScopeService.canAccessEmployee('manager-1', 'sub-synced'),
    ).resolves.toBe(true);
  });

  it('excludes failed department employees from a synced dept_head scope and managed collections', async () => {
    const deptHead = createEmployeeRow({
      employeeId: 'head-1',
      authorizationRoles: ['dept_head', 'employee'],
      departmentId: 'dept-a',
    });
    const syncedEmployee = createEmployeeRow({
      employeeId: 'dept-synced',
      departmentId: 'dept-a',
      authorizationRoles: ['employee'],
    });
    const failedEmployee = createEmployeeRow({
      employeeId: 'dept-failed',
      authorizationStatus: 'failed',
      departmentId: 'dept-a',
      authorizationRoles: ['employee'],
    });

    const { accessScopeService } = createServices({
      employees: [deptHead, syncedEmployee, failedEmployee],
      departments: [
        { id: 'dept-a', headId: 'head-1', isActive: true },
      ],
      rolesByUser: {
        'head-1': ['dept_head', 'employee'],
        'dept-synced': ['employee'],
        'dept-failed': ['employee'],
      },
    });

    await expect(accessScopeService.getScope('head-1')).resolves.toEqual({
      kind: 'managed',
      roles: ['dept_head', 'employee'],
      departmentIds: ['dept-a'],
      subordinateIds: [],
    });

    const condition = await accessScopeService.buildEmployeeScopeCondition(
      'head-1',
      { includeSelf: false },
    );
    expect(condition).not.toBeNull();
    await expect(
      accessScopeService.getManagedEmployeeIds('head-1', {
        includeSelf: false,
      }),
    ).resolves.toEqual(['dept-synced', 'dept-failed']);
    await expect(
      accessScopeService.canAccessEmployee('head-1', 'dept-failed'),
    ).resolves.toBe(true);
    await expect(
      accessScopeService.canAccessEmployee('head-1', 'dept-synced'),
    ).resolves.toBe(true);
  });

  it.each([
    {
      label: 'inactive',
      employee: createEmployeeRow({ status: false }),
    },
    {
      label: 'deleted',
      employee: createEmployeeRow({
        deletedAt: new Date('2026-07-18T00:00:00Z'),
      }),
    },
  ] as const)(
    'fails closed for %s self target access',
    async ({ employee }) => {
      const { accessScopeService } = createServices({
        employees: [employee],
        rolesByUser: {
          [employee.employeeId]: ['employee'],
        },
      });

      await expect(
        accessScopeService.canAccessEmployee(
          employee.employeeId,
          employee.employeeId,
          { includeSelf: true },
        ),
      ).resolves.toBe(false);
    },
  );
});

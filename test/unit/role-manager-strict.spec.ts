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
    Delete: noopDecorator,
    Body: noopDecorator,
    Param: noopDecorator,
    Query: noopDecorator,
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

import { RoleManagerController } from '../../server/modules/role-manager/role-manager.controller';
import { RoleManagerService } from '../../server/modules/role-manager/role-manager.service';
import { QueryBackedDb, type FakeEmployeeRow } from './query-fakes';

function createAuthzSdk(userId = 'employee-1') {
  // 新 contract：roles.list({ needMember, userID }) 一次返回 roleMembers
  return {
    roles: {
      list: jest.fn().mockResolvedValue([
        {
          bizID: 'admin',
          roleMembers: { userList: [{ userID: userId }] },
        },
      ]),
    },
  };
}

function createRoleManagerService(
  db: QueryBackedDb,
  authzSDK: Record<string, any>,
) {
  return new (RoleManagerService as any)(db, authzSDK) as RoleManagerService;
}

function createEmployeeRow(
  overrides: Partial<FakeEmployeeRow> = {},
): FakeEmployeeRow {
  return {
    employeeId: 'employee-1',
    status: true,
    deletedAt: null,
    authorizationStatus: 'synced',
    authorizationRoles: ['admin'],
    authorizationVersion: 1,
    supervisorId: null,
    departmentId: null,
    ...overrides,
  };
}

describe('strict role manager operations', () => {
  it('propagates fresh SDK role-list failures', async () => {
    const sdkFailure = new Error('sdk role list failed');
    const service = createRoleManagerService(new QueryBackedDb(), {
      roles: {
        list: jest.fn().mockRejectedValue(sdkFailure),
      },
      members: {
        list: jest.fn(),
      },
    });

    await expect(
      (service as any).getUserRolesStrict('employee-1'),
    ).rejects.toBe(sdkFailure);
  });

  it('unwraps SDK envelopes and reads custom-role membership from roleMembers', async () => {
    const rolesList = jest.fn().mockResolvedValue({
      data: [
        {
          bizID: 'custom-reviewer',
          roleMembers: { userList: [{ userID: 'employee-1' }] },
        },
      ],
    });
    const service = createRoleManagerService(new QueryBackedDb(), {
      roles: { list: rolesList },
    });

    await expect(
      (service as any).getUserRolesStrict('employee-1'),
    ).resolves.toEqual(['custom-reviewer']);

    expect(rolesList).toHaveBeenCalledWith({
      needMember: true,
      userID: 'employee-1',
    });
  });

  it('propagates strict revoke failures and invalidates the affected cache', async () => {
    const revokeFailure = new Error('sdk revoke failed');
    const service = createRoleManagerService(new QueryBackedDb(), {
      roles: {
        list: jest.fn().mockResolvedValue([
          {
            bizID: 'custom-reviewer',
            roleMembers: { userList: [{ userID: 'employee-1' }] },
          },
        ]),
      },
      members: {
        remove: jest.fn().mockRejectedValue(revokeFailure),
      },
    });
    (service as any).roleCache.set('employee-1', {
      roles: ['stale-role'],
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      (service as any).reconcileUserRoles('employee-1', []),
    ).rejects.toBe(revokeFailure);

    expect((service as any).roleCache.has('employee-1')).toBe(false);
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
  ] as const)('fails closed for %s employees', async ({ employee }) => {
    // 非 admin 角色：员工记录无效 → 无权限（fails closed）
    const db = new QueryBackedDb({
      employees: [employee],
      rolePermissionConfigs: [
        {
          roleBizId: 'employee',
          permissions: [{ resource: 'employees', actions: ['view'] }],
        },
      ],
    });
    const authzSDK = {
      roles: {
        list: jest.fn().mockResolvedValue([
          {
            bizID: 'employee',
            roleMembers: { userList: [{ userID: employee.employeeId }] },
          },
        ]),
      },
    };
    const service = createRoleManagerService(db, authzSDK);

    await expect(
      service.checkUserPermission(employee.employeeId, 'employees', 'view'),
    ).resolves.toBe(false);
    await expect(
      service.getUserEffectivePermissions(employee.employeeId),
    ).resolves.toEqual([]);
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
    'keeps admin bypass for %s employees with admin role',
    async ({ employee }) => {
      // 51c2e9a 有意设计：admin 豁免员工有效性检查（修复全站403），
      // 即使员工 inactive/deleted 仍拥有权限
      const db = new QueryBackedDb({
        employees: [employee],
        rolePermissionConfigs: [
          {
            roleBizId: 'admin',
            permissions: [{ resource: 'employees', actions: ['view'] }],
          },
        ],
      });
      const authzSDK = createAuthzSdk(employee.employeeId);
      const service = createRoleManagerService(db, authzSDK);

      await expect(
        service.checkUserPermission(employee.employeeId, 'employees', 'view'),
      ).resolves.toBe(true);
      await expect(
        service.getUserEffectivePermissions(employee.employeeId),
      ).resolves.toEqual([{ resource: 'employees', actions: ['view'] }]);
    },
  );

  it('grants permissions to active employees', async () => {
    const employee = createEmployeeRow();
    const db = new QueryBackedDb({
      employees: [employee],
      rolePermissionConfigs: [
        {
          roleBizId: 'admin',
          permissions: [{ resource: 'employees', actions: ['view'] }],
        },
      ],
    });
    const authzSDK = createAuthzSdk(employee.employeeId);
    const service = createRoleManagerService(db, authzSDK);

    await expect(
      service.checkUserPermission(employee.employeeId, 'employees', 'view'),
    ).resolves.toBe(true);
    await expect(
      service.getUserEffectivePermissions(employee.employeeId),
    ).resolves.toEqual([{ resource: 'employees', actions: ['view'] }]);
  });

  it.each([
    ['addMembers', 'add'],
    ['removeMembers', 'remove'],
  ] as const)(
    'routes explicit custom-role users through durable authorization for %s',
    async (operation, mutation) => {
      const authzSDK = {
        members: {
          add: jest.fn().mockResolvedValue({ success: true }),
          remove: jest.fn().mockResolvedValue({ success: true }),
        },
      };
      const roleManagerService = {
        mutateCustomRoleMembers: jest.fn().mockResolvedValue({
          success: true,
          outcomes: [],
        }),
      };
      const authorizationSyncService = {};
      const controller = new (RoleManagerController as any)(
        authzSDK as any,
        roleManagerService as any,
        authorizationSyncService,
      ) as RoleManagerController;
      const dto = {
        members: {
          userList: [{ userID: 'employee-1' }, { userID: 'employee-2' }],
        },
      };

      await (controller[operation] as any)('custom-reviewer', dto);

      expect(roleManagerService.mutateCustomRoleMembers).toHaveBeenCalledWith(
        'custom-reviewer',
        ['employee-1', 'employee-2'],
        mutation,
        authorizationSyncService,
      );
      expect(authzSDK.members.add).not.toHaveBeenCalled();
      expect(authzSDK.members.remove).not.toHaveBeenCalled();
    },
  );
});

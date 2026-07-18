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
import {
  QueryBackedDb,
  type FakeEmployeeRow,
} from './query-fakes';

function createAuthzSdk(userId = 'employee-1') {
  return {
    roles: {
      list: jest.fn().mockResolvedValue([{ bizID: 'admin' }]),
    },
    members: {
      list: jest.fn().mockResolvedValue({
        members: { userList: [{ userID: userId }] },
        hasMore: false,
      }),
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
    const service = createRoleManagerService(
      new QueryBackedDb(),
      {
        roles: {
          list: jest.fn().mockRejectedValue(sdkFailure),
        },
        members: {
          list: jest.fn(),
        },
      },
    );

    await expect(
      (service as any).getUserRolesStrict('employee-1'),
    ).rejects.toBe(sdkFailure);
  });

  it('unwraps SDK envelopes and paginates custom-role members', async () => {
    const membersList = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          members: { userList: [] },
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          members: { userList: [{ userID: 'employee-1' }] },
          hasMore: false,
        },
      });
    const service = createRoleManagerService(new QueryBackedDb(), {
      roles: {
        list: jest.fn().mockResolvedValue({
          data: [{ bizID: 'custom-reviewer' }],
        }),
      },
      members: {
        list: membersList,
      },
    });

    await expect(
      (service as any).getUserRolesStrict('employee-1'),
    ).resolves.toEqual(['custom-reviewer']);

    expect(membersList).toHaveBeenNthCalledWith(1, 'custom-reviewer', {
      page: 1,
      pageSize: 999,
    });
    expect(membersList).toHaveBeenNthCalledWith(2, 'custom-reviewer', {
      page: 2,
      pageSize: 999,
    });
  });

  it('propagates strict revoke failures and invalidates the affected cache', async () => {
    const revokeFailure = new Error('sdk revoke failed');
    const service = createRoleManagerService(new QueryBackedDb(), {
      roles: {
        list: jest.fn().mockResolvedValue([{ bizID: 'custom-reviewer' }]),
      },
      members: {
        list: jest.fn().mockResolvedValue({
          userList: [{ userID: 'employee-1' }],
        }),
        add: jest.fn(),
        remove: jest.fn().mockRejectedValue(revokeFailure),
      },
    });
    (service as any).roleCache.set('employee-1', {
      roles: ['stale-role'],
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      (service as any).syncUserRolesStrict('employee-1', []),
    ).rejects.toBe(revokeFailure);

    expect((service as any).roleCache.has('employee-1')).toBe(false);
  });

  it.each([
    {
      label: 'pending',
      employee: createEmployeeRow({ authorizationStatus: 'pending' }),
    },
    {
      label: 'failed',
      employee: createEmployeeRow({ authorizationStatus: 'failed' }),
    },
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
    'fails closed for %s employees',
    async ({ employee }) => {
      const db = new QueryBackedDb({
        employees: [employee],
        rolePermissionConfigs: [
          {
            roleBizId: 'admin',
            permissions: [
              { resource: 'employees', actions: ['view'] },
            ],
          },
        ],
      });
      const authzSDK = createAuthzSdk(employee.employeeId);
      const service = createRoleManagerService(db, authzSDK);

      await expect(
        service.checkUserPermission(employee.employeeId, 'employees', 'view'),
      ).resolves.toBe(false);
      await expect(
        service.getUserEffectivePermissions(employee.employeeId),
      ).resolves.toEqual([]);
      expect(authzSDK.roles.list).not.toHaveBeenCalled();
      expect(authzSDK.members.list).not.toHaveBeenCalled();
    },
  );

  it('grants permissions only to synced active employees', async () => {
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
        mutateCustomRoleMembers: jest.fn().mockResolvedValue(undefined),
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

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
import { AccessScopeService } from '../../server/common/access/access-scope.service';

function createRoleManagerService(authzSDK: Record<string, any>) {
  return new (RoleManagerService as any)(
    {
      select: jest.fn().mockReturnValue(
        employeeQuery([
          {
            status: true,
            deletedAt: null,
          },
        ]),
      ),
    },
    authzSDK,
  ) as RoleManagerService;
}

function employeeQuery(rows: unknown[]) {
  const query = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

function authorizationQuery(
  limitRows: unknown[],
  awaitedRows: unknown[],
) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(limitRows),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(awaitedRows).then(resolve, reject),
  };
}

describe('strict role manager operations', () => {
  it('propagates fresh SDK role-list failures', async () => {
    const sdkFailure = new Error('sdk role list failed');
    const service = createRoleManagerService({
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
    const service = createRoleManagerService({
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
    const service = createRoleManagerService({
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

  it('denies stale SDK admin capability and global scope to an inactive employee', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(authorizationQuery([], []))
        .mockReturnValueOnce(authorizationQuery([], []))
        .mockReturnValueOnce(employeeQuery([])),
    };
    const authzSDK = {
      roles: {
        list: jest.fn().mockResolvedValue([{ bizID: 'admin' }]),
      },
      members: {
        list: jest.fn().mockResolvedValue({
          userList: [{ userID: 'employee-1' }],
        }),
      },
    };
    const roleManagerService = new (RoleManagerService as any)(
      db,
      authzSDK,
    ) as RoleManagerService;
    const accessScopeService = new (AccessScopeService as any)(
      db,
      roleManagerService,
    ) as AccessScopeService;

    await expect(
      roleManagerService.checkUserPermission(
        'employee-1',
        'employees',
        'view',
      ),
    ).resolves.toBe(false);
    await expect(
      roleManagerService.getUserEffectivePermissions('employee-1'),
    ).resolves.toEqual([]);
    await expect(accessScopeService.getScope('employee-1')).resolves.toEqual({
      kind: 'self',
      roles: [],
      departmentIds: [],
      subordinateIds: [],
    });

    expect(authzSDK.roles.list).not.toHaveBeenCalled();
    expect(authzSDK.members.list).not.toHaveBeenCalled();
  });

  it.each(['addMembers', 'removeMembers'] as const)(
    'invalidates every affected user cache after %s succeeds',
    async (operation) => {
      const authzSDK = {
        members: {
          add: jest.fn().mockResolvedValue({ success: true }),
          remove: jest.fn().mockResolvedValue({ success: true }),
        },
      };
      const roleManagerService = {
        invalidateUserRoleCache: jest.fn(),
      };
      const controller = new RoleManagerController(
        authzSDK as any,
        roleManagerService as any,
      );
      const dto = {
        members: {
          userList: [{ userID: 'employee-1' }, { userID: 'employee-2' }],
        },
      };

      await (controller[operation] as any)('custom-reviewer', dto);

      expect(roleManagerService.invalidateUserRoleCache).toHaveBeenCalledWith(
        'employee-1',
      );
      expect(roleManagerService.invalidateUserRoleCache).toHaveBeenCalledWith(
        'employee-2',
      );
    },
  );
});

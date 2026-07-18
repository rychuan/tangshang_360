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
import { BUILTIN_ROLE_CODES } from '../../shared/types/permission.types';

const permissionTypes =
  require('../../shared/types/permission.types') as Record<string, any>;

function createController(
  authzSDK: Record<string, any>,
  roleManagerService: Record<string, any>,
  authorizationSyncService: Record<string, any> = {},
) {
  return new (RoleManagerController as any)(
    authzSDK,
    roleManagerService,
    authorizationSyncService,
  ) as RoleManagerController;
}

function limitedQuery(rows: unknown[]) {
  const query = {
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

describe('role administration invariants', () => {
  it('exports the built-in role boundary', () => {
    expect(typeof permissionTypes.isBuiltinRole).toBe('function');
    if (typeof permissionTypes.isBuiltinRole !== 'function') return;

    for (const role of BUILTIN_ROLE_CODES) {
      expect(permissionTypes.isBuiltinRole(role)).toBe(true);
    }
    expect(permissionTypes.isBuiltinRole('custom-reviewer')).toBe(false);
  });

  it.each(BUILTIN_ROLE_CODES)(
    'rejects generic member mutation for %s',
    async (roleBizId) => {
      const authzSDK = {
        members: {
          add: jest.fn().mockResolvedValue({ success: true }),
          remove: jest.fn().mockResolvedValue({ success: true }),
        },
      };
      const roleManagerService = {
        mutateCustomRoleMembers: jest.fn(),
      };
      const controller = createController(authzSDK, roleManagerService);
      const dto = {
        members: { userList: [{ userID: 'employee-1' }] },
      };

      await expect(
        controller.addMembers(roleBizId, dto as any),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        controller.removeMembers(roleBizId, dto as any),
      ).rejects.toMatchObject({ status: 400 });

      expect(roleManagerService.mutateCustomRoleMembers).not.toHaveBeenCalled();
      expect(authzSDK.members.add).not.toHaveBeenCalled();
      expect(authzSDK.members.remove).not.toHaveBeenCalled();
    },
  );

  it.each(BUILTIN_ROLE_CODES)(
    'rejects deletion of built-in role %s',
    async (roleBizId) => {
      const authzSDK = {
        roles: {
          delete: jest.fn().mockResolvedValue({ success: true }),
        },
      };
      const roleManagerService = {
        deletePermissionConfig: jest.fn(),
      };
      const controller = createController(authzSDK, roleManagerService);

      await expect(controller.deleteRole(roleBizId)).rejects.toMatchObject({
        status: 400,
      });

      expect(authzSDK.roles.delete).not.toHaveBeenCalled();
      expect(roleManagerService.deletePermissionConfig).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['department', { departmentList: [{ id: 'dept-1' }] }],
    ['chat', { groupChatList: [{ chatID: 'chat-1' }] }],
    ['all-employee', { allEmployees: true }],
    ['preset-group', { isContainsAdmin: true }],
  ])('rejects %s custom-role member payloads', async (_label, members) => {
    const authzSDK = {
      members: {
        add: jest.fn().mockResolvedValue({ success: true }),
      },
    };
    const roleManagerService = {
      mutateCustomRoleMembers: jest.fn(),
    };
    const controller = createController(authzSDK, roleManagerService);

    await expect(
      controller.addMembers('custom-reviewer', { members } as any),
    ).rejects.toMatchObject({ status: 400 });

    expect(roleManagerService.mutateCustomRoleMembers).not.toHaveBeenCalled();
    expect(authzSDK.members.add).not.toHaveBeenCalled();
  });

  it.each([
    {
      operation: 'add',
      currentRoles: ['employee'],
      expectedRoles: ['custom-reviewer', 'employee'],
    },
    {
      operation: 'remove',
      currentRoles: ['custom-reviewer', 'employee'],
      expectedRoles: ['employee'],
    },
  ] as const)(
    'persists explicit custom-role user $operation changes through authorization state',
    async ({ operation, currentRoles, expectedRoles }) => {
      const tx = {
        select: jest.fn(() =>
          limitedQuery([
            {
              employeeId: 'employee-1',
              authorizationRoles: currentRoles,
            },
          ]),
        ),
      };
      const db = {
        transaction: jest.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const stageAuthorizationChange = jest.fn().mockResolvedValue(7);
      const processEmployeeAuthorization = jest
        .fn()
        .mockResolvedValue({ status: 'synced', version: 7 });
      const authorizationSyncService = {
        stageAuthorizationChange,
        processEmployeeAuthorization,
      };
      const service = new (RoleManagerService as any)(db, {
        members: { add: jest.fn(), remove: jest.fn() },
      }) as RoleManagerService;

      await (service as any).mutateCustomRoleMembers(
        'custom-reviewer',
        ['employee-1'],
        operation,
        authorizationSyncService,
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(stageAuthorizationChange).toHaveBeenCalledWith(
        tx,
        'employee-1',
        expectedRoles,
      );
      expect(processEmployeeAuthorization).toHaveBeenCalledWith(
        'employee-1',
        7,
      );
    },
  );

  it('normalizes known permissions, merges duplicates and implies view', () => {
    expect(typeof permissionTypes.normalizePermissionConfig).toBe('function');
    if (typeof permissionTypes.normalizePermissionConfig !== 'function') return;

    expect(
      permissionTypes.normalizePermissionConfig('custom-reviewer', [
        { resource: 'employees', actions: ['edit'] },
        { resource: 'employees', actions: ['delete', 'edit'] },
      ]),
    ).toEqual([
      {
        resource: 'employees',
        actions: ['view', 'edit', 'delete'],
      },
    ]);
    expect(() =>
      permissionTypes.normalizePermissionConfig('custom-reviewer', [
        { resource: 'unknown', actions: ['view'] },
      ]),
    ).toThrow();
    expect(() =>
      permissionTypes.normalizePermissionConfig('custom-reviewer', [
        { resource: 'employees', actions: ['unknown'] },
      ]),
    ).toThrow();
  });

  it.each([
    [{ resource: 'permission_management', actions: ['edit'] }],
    [{ resource: 'permission_management', actions: ['view'] }],
    [{ resource: 'employees', actions: ['view', 'edit'] }],
  ])(
    'prevents admin permission_management view or edit removal',
    async (permissions) => {
      const db = {
        select: jest.fn(() => {
          throw new Error('database should not be read for invalid config');
        }),
      };
      const service = new (RoleManagerService as any)(
        db,
        {},
      ) as RoleManagerService;

      await expect(
        service.upsertPermissionConfig('admin', permissions as any),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.select).not.toHaveBeenCalled();
    },
  );

  it('keeps local config when SDK custom-role deletion fails', async () => {
    const sdkFailure = new Error('sdk delete failed');
    const authzSDK = {
      roles: {
        delete: jest.fn().mockRejectedValue(sdkFailure),
      },
    };
    const roleManagerService = {
      deletePermissionConfig: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createController(authzSDK, roleManagerService);

    await expect(controller.deleteRole('custom-reviewer')).rejects.toBe(
      sdkFailure,
    );

    expect(roleManagerService.deletePermissionConfig).not.toHaveBeenCalled();
  });

  it('deletes local custom-role config only after SDK deletion succeeds', async () => {
    const authzSDK = {
      roles: {
        delete: jest.fn().mockResolvedValue({ success: true }),
      },
    };
    const roleManagerService = {
      deletePermissionConfig: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createController(authzSDK, roleManagerService);

    await expect(controller.deleteRole('custom-reviewer')).resolves.toEqual({
      success: true,
    });

    expect(authzSDK.roles.delete).toHaveBeenCalledWith('custom-reviewer');
    expect(roleManagerService.deletePermissionConfig).toHaveBeenCalledWith(
      'custom-reviewer',
    );
    expect(authzSDK.roles.delete.mock.invocationCallOrder[0]).toBeLessThan(
      roleManagerService.deletePermissionConfig.mock.invocationCallOrder[0],
    );
  });
});

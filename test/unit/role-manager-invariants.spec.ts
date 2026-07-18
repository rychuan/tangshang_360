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
import { HttpException } from '@nestjs/common';
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
    orderBy: jest.fn(),
    for: jest.fn().mockResolvedValue(rows),
    limit: jest.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
}

function createDeleteDb(memberRows: unknown[]) {
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: jest.fn(() => limitedQuery(memberRows)),
    delete: jest.fn(() => ({ where: deleteWhere })),
  };
  const db = {
    transaction: jest.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  return { db, tx, deleteWhere };
}

class ConcurrentRoleDb {
  roles = ['employee'];
  unlockedReadCount = 0;
  lockStrengths: string[] = [];
  private releaseUnlockedReads!: () => void;
  private readonly unlockedReads = new Promise<void>((resolve) => {
    this.releaseUnlockedReads = resolve;
  });
  private lockTail = Promise.resolve();

  transaction = jest.fn(
    async (
      callback: (
        transaction: ReturnType<ConcurrentRoleDb['createTx']>,
      ) => Promise<unknown>,
    ) => {
      let releaseLock: (() => void) | undefined;
      const tx = this.createTx((release) => {
        releaseLock = release;
      });
      try {
        return await callback(tx);
      } finally {
        releaseLock?.();
      }
    },
  );

  private createTx(setRelease: (release: () => void) => void) {
    const query = {
      from: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(async () => {
        const snapshot = [...this.roles];
        this.unlockedReadCount += 1;
        if (this.unlockedReadCount === 2) this.releaseUnlockedReads();
        await this.unlockedReads;
        return [
          {
            employeeId: 'employee-1',
            status: true,
            deletedAt: null,
            authorizationRoles: snapshot,
          },
        ];
      }),
      for: jest.fn(async (strength: string) => {
        this.lockStrengths.push(strength);
        let release!: () => void;
        const previous = this.lockTail;
        this.lockTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        setRelease(release);
        return [
          {
            employeeId: 'employee-1',
            status: true,
            deletedAt: null,
            authorizationRoles: [...this.roles],
          },
        ];
      }),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    return {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn(() => query),
    };
  }
}

function createBatchDb(rows: unknown[]) {
  let unlockedReadIndex = 0;
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: jest.fn(() => {
      const query = {
        from: jest.fn(),
        where: jest.fn(),
        orderBy: jest.fn(),
        limit: jest.fn(async () => {
          const row = rows[unlockedReadIndex];
          unlockedReadIndex += 1;
          return row ? [row] : [];
        }),
        for: jest.fn().mockResolvedValue(rows),
      };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.orderBy.mockReturnValue(query);
      return query;
    }),
  };
  const db = {
    transaction: jest.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  return { db, tx };
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

  it.each(['addMembers', 'removeMembers'] as const)(
    'rejects malformed explicit user entries for %s',
    async (operation) => {
      const controller = createController(
        { members: { add: jest.fn(), remove: jest.fn() } },
        { mutateCustomRoleMembers: jest.fn() },
      );

      for (const entry of [
        null,
        7,
        'employee-1',
        {},
        { userID: 7 },
        { userID: '   ' },
      ]) {
        await expect(
          (controller[operation] as any)('custom-reviewer', {
            members: { userList: [entry] },
          }),
        ).rejects.toMatchObject({ status: 400 });
      }
    },
  );

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
        execute: jest.fn().mockResolvedValue(undefined),
        select: jest.fn(() =>
          limitedQuery([
            {
              employeeId: 'employee-1',
              status: true,
              deletedAt: null,
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
    ['dashboard', 'delete'],
    ['statistics', 'edit'],
    ['permission_management', 'publish'],
  ])('rejects invalid permission pair %s:%s', (resource, action) => {
    expect(() =>
      permissionTypes.normalizePermissionConfig('custom-reviewer', [
        { resource, actions: [action] },
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

  it('rejects deletion of a populated custom role before SDK access', async () => {
    const { db, tx } = createDeleteDb([{ employeeId: 'employee-1' }]);
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;
    const deleteFromSdk = jest.fn().mockResolvedValue({ success: true });

    await expect(
      (service as any).deleteCustomRole('custom-reviewer', deleteFromSdk),
    ).rejects.toMatchObject({ status: 400 });

    expect(deleteFromSdk).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('keeps local config when SDK custom-role deletion fails', async () => {
    const sdkFailure = new Error('sdk delete failed');
    const authzSDK = {
      roles: {
        delete: jest.fn().mockRejectedValue(sdkFailure),
      },
    };
    const roleManagerService = {
      deleteCustomRole: jest.fn(
        async (_roleBizId: string, deleteFromSdk: () => Promise<unknown>) =>
          deleteFromSdk(),
      ),
    };
    const controller = createController(authzSDK, roleManagerService);

    await expect(controller.deleteRole('custom-reviewer')).rejects.toBe(
      sdkFailure,
    );

    expect(roleManagerService.deleteCustomRole).toHaveBeenCalled();
  });

  it('deletes local custom-role config only after SDK deletion succeeds', async () => {
    const { db, tx } = createDeleteDb([]);
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;
    const deleteFromSdk = jest.fn().mockResolvedValue({ success: true });

    await expect(
      (service as any).deleteCustomRole('custom-reviewer', deleteFromSdk),
    ).resolves.toEqual({
      success: true,
    });

    expect(deleteFromSdk).toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalled();
    expect(deleteFromSdk.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0],
    );
  });

  it('cleans local config when SDK reports the custom role already missing', async () => {
    const { db, tx } = createDeleteDb([]);
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;
    const sdkNotFound = new HttpException(
      {
        statusCode: 404,
        code: 'PLATFORM_API_ERROR',
        message: 'role not found',
      },
      404,
    );

    await expect(
      (service as any).deleteCustomRole(
        'custom-reviewer',
        jest.fn().mockRejectedValue(sdkNotFound),
      ),
    ).resolves.toMatchObject({ success: true, alreadyDeleted: true });

    expect(tx.delete).toHaveBeenCalled();
  });

  it('does not treat arbitrary SDK errors as idempotent role deletion', async () => {
    const { db, tx } = createDeleteDb([]);
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;
    const arbitraryFailure = new HttpException(
      {
        statusCode: 404,
        code: 'UNRELATED_NOT_FOUND',
        message: 'other resource missing',
      },
      404,
    );

    await expect(
      (service as any).deleteCustomRole(
        'custom-reviewer',
        jest.fn().mockRejectedValue(arbitraryFailure),
      ),
    ).rejects.toBe(arbitraryFailure);

    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('computes concurrent custom-role changes from lock-current durable state', async () => {
    const db = new ConcurrentRoleDb();
    let version = 0;
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn(
        async (_tx: unknown, _employeeId: string, desiredRoles: string[]) => {
          db.roles = desiredRoles;
          version += 1;
          return version;
        },
      ),
      processEmployeeAuthorization: jest.fn(
        async (_employeeId: string, authorizationVersion: number) => ({
          status: 'synced',
          version: authorizationVersion,
        }),
      ),
    };
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;

    await Promise.all([
      (service as any).mutateCustomRoleMembers(
        'custom-a',
        ['employee-1'],
        'add',
        authorizationSyncService,
      ),
      (service as any).mutateCustomRoleMembers(
        'custom-b',
        ['employee-1'],
        'add',
        authorizationSyncService,
      ),
    ]);

    expect(db.lockStrengths).toEqual(['update', 'update']);
    expect(db.roles).toEqual(['custom-a', 'custom-b', 'employee']);
  });

  it('rolls back the whole batch when a later employee fails validation', async () => {
    const { db } = createBatchDb([
      {
        employeeId: 'employee-1',
        status: true,
        deletedAt: null,
        authorizationRoles: ['employee'],
      },
      {
        employeeId: 'employee-2',
        status: false,
        deletedAt: null,
        authorizationRoles: ['employee'],
      },
    ]);
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn().mockResolvedValue(1),
      processEmployeeAuthorization: jest.fn(),
    };
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;

    await expect(
      (service as any).mutateCustomRoleMembers(
        'custom-reviewer',
        ['employee-1', 'employee-2'],
        'add',
        authorizationSyncService,
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });

  it('returns identifiable per-user outcomes for mixed synchronization results', async () => {
    const { db } = createBatchDb([
      {
        employeeId: 'employee-1',
        status: true,
        deletedAt: null,
        authorizationRoles: ['employee'],
      },
      {
        employeeId: 'employee-2',
        status: true,
        deletedAt: null,
        authorizationRoles: ['employee'],
      },
    ]);
    let version = 0;
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn(async () => {
        version += 1;
        return version;
      }),
      processEmployeeAuthorization: jest
        .fn()
        .mockResolvedValueOnce({ status: 'synced', version: 1 })
        .mockResolvedValueOnce({
          status: 'failed',
          version: 2,
          error: 'sdk add failed',
        }),
    };
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;

    await expect(
      (service as any).mutateCustomRoleMembers(
        'custom-reviewer',
        ['employee-2', 'employee-1'],
        'add',
        authorizationSyncService,
      ),
    ).resolves.toEqual({
      success: false,
      outcomes: [
        { userId: 'employee-1', status: 'synced', version: 1 },
        {
          userId: 'employee-2',
          status: 'failed',
          version: 2,
          error: 'sdk add failed',
        },
      ],
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledTimes(2);
  });

  it('surfaces mixed synchronization outcomes through the controller error', async () => {
    const result = {
      success: false,
      outcomes: [
        { userId: 'employee-1', status: 'synced', version: 1 },
        {
          userId: 'employee-2',
          status: 'failed',
          version: 2,
          error: 'sdk add failed',
        },
      ],
    };
    const controller = createController(
      {},
      { mutateCustomRoleMembers: jest.fn().mockResolvedValue(result) },
      {},
    );

    let caught: unknown;
    try {
      await controller.addMembers('custom-reviewer', {
        members: {
          userList: [{ userID: 'employee-1' }, { userID: 'employee-2' }],
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ status: 502 });
    expect((caught as HttpException).getResponse()).toMatchObject(result);
  });

  it('reprocesses the current version for an idempotent failed member retry', async () => {
    const { db } = createBatchDb([
      {
        employeeId: 'employee-1',
        status: true,
        deletedAt: null,
        authorizationRoles: ['custom-reviewer', 'employee'],
        authorizationStatus: 'failed',
        authorizationVersion: 4,
      },
    ]);
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn(),
      processEmployeeAuthorization: jest
        .fn()
        .mockResolvedValue({ status: 'synced', version: 4 }),
    };
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;

    await expect(
      (service as any).mutateCustomRoleMembers(
        'custom-reviewer',
        ['employee-1'],
        'add',
        authorizationSyncService,
      ),
    ).resolves.toEqual({
      success: true,
      outcomes: [{ userId: 'employee-1', status: 'synced', version: 4 }],
    });

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).toHaveBeenCalledWith('employee-1', 4);
  });

  it('returns unchanged for an idempotent synced member retry', async () => {
    const { db } = createBatchDb([
      {
        employeeId: 'employee-1',
        status: true,
        deletedAt: null,
        authorizationRoles: ['custom-reviewer', 'employee'],
        authorizationStatus: 'synced',
        authorizationVersion: 4,
      },
    ]);
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn(),
      processEmployeeAuthorization: jest.fn(),
    };
    const service = new (RoleManagerService as any)(
      db,
      {},
    ) as RoleManagerService;

    await expect(
      (service as any).mutateCustomRoleMembers(
        'custom-reviewer',
        ['employee-1'],
        'add',
        authorizationSyncService,
      ),
    ).resolves.toEqual({
      success: true,
      outcomes: [{ userId: 'employee-1', status: 'unchanged' }],
    });

    expect(
      authorizationSyncService.stageAuthorizationChange,
    ).not.toHaveBeenCalled();
    expect(
      authorizationSyncService.processEmployeeAuthorization,
    ).not.toHaveBeenCalled();
  });
});

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

describe('role fallback from local employee.role', () => {
  function createEmptyRolesService(employee: FakeEmployeeRow) {
    const db = new QueryBackedDb({ employees: [employee] });
    const authzSDK = {
      roles: { list: jest.fn().mockResolvedValue([]) },
    };
    return createRoleManagerService(db, authzSDK);
  }

  it('falls back to local roles only for synced employees', async () => {
    const employee = createEmployeeRow({
      role: 'admin,hrd',
      authorizationStatus: 'synced',
    });
    const service = createEmptyRolesService(employee);

    await expect(service.getUserRoles(employee.employeeId)).resolves.toEqual([
      'admin',
      'hrd',
    ]);
  });

  it.each(['pending', 'failed'] as const)(
    'keeps fails-closed for %s employees even with local roles',
    async (authorizationStatus) => {
      const employee = createEmployeeRow({
        role: 'admin',
        authorizationStatus,
      });
      const service = createEmptyRolesService(employee);

      await expect(service.getUserRoles(employee.employeeId)).resolves.toEqual(
        [],
      );
    },
  );

  it('never falls back on the strict path', async () => {
    const employee = createEmployeeRow({
      role: 'admin',
      authorizationStatus: 'synced',
    });
    const service = createEmptyRolesService(employee);

    await expect(
      service.getUserRolesStrict(employee.employeeId),
    ).resolves.toEqual([]);
  });

  it('does not fall back when the employee record is missing', async () => {
    const service = createEmptyRolesService(createEmployeeRow());

    await expect(service.getUserRoles('missing-user')).resolves.toEqual([]);
  });
});

describe('listAllMembers pagination hardening', () => {
  function createServiceWithMembers(membersList: jest.Mock) {
    const db = new QueryBackedDb();
    const authzSDK = { members: { list: membersList } };
    return new (RoleManagerService as any)(db, authzSDK) as RoleManagerService;
  }

  it('merges all pages and keeps first-page meta', async () => {
    const membersList = jest
      .fn()
      .mockImplementation((_bizID: string, params: { page?: number }) => {
        if (params.page === 1) {
          return Promise.resolve({
            members: {
              userList: [{ userID: 'u1' }, { userID: 'u2' }],
              departmentList: [{ id: 'd1' }],
              allEmployees: true,
              presetGroup: { isContainsAdmin: true },
            },
            hasMore: true,
          });
        }
        return Promise.resolve({
          members: { userList: [{ userID: 'u3' }] },
          hasMore: false,
        });
      });
    const service = createServiceWithMembers(membersList);

    const result = (await service.listAllMembers('admin', 'user')) as {
      members: {
        userList: Array<{ userID: string }>;
        departmentList: Array<{ id: string }>;
        allEmployees?: boolean;
        presetGroup?: { isContainsAdmin?: boolean };
      };
      total: number;
      hasMore: boolean;
    };

    expect(result.members.userList).toEqual([
      { userID: 'u1' },
      { userID: 'u2' },
      { userID: 'u3' },
    ]);
    expect(result.members.departmentList).toEqual([{ id: 'd1' }]);
    // meta 取第一页，而非最后一页覆盖
    expect(result.members.allEmployees).toBe(true);
    expect(result.members.presetGroup).toEqual({ isContainsAdmin: true });
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(false);
    expect(membersList).toHaveBeenCalledTimes(2);
  });

  it('dedupes users repeated across pages', async () => {
    const membersList = jest
      .fn()
      .mockImplementation((_bizID: string, params: { page?: number }) => {
        if (params.page === 1) {
          return Promise.resolve({
            members: { userList: [{ userID: 'u1' }, { userID: 'u2' }] },
            hasMore: true,
          });
        }
        return Promise.resolve({
          members: { userList: [{ userID: 'u2' }, { userID: 'u3' }] },
          hasMore: false,
        });
      });
    const service = createServiceWithMembers(membersList);

    const result = (await service.listAllMembers('admin')) as {
      members: { userList: Array<{ userID: string }> };
      total: number;
    };

    expect(result.members.userList.map((u) => u.userID)).toEqual([
      'u1',
      'u2',
      'u3',
    ]);
    expect(result.total).toBe(3);
  });

  it('stops when a page yields no new members despite hasMore', async () => {
    const membersList = jest.fn().mockResolvedValue({
      members: { userList: [{ userID: 'u1' }] },
      hasMore: true,
    });
    const service = createServiceWithMembers(membersList);

    const result = (await service.listAllMembers('admin')) as {
      members: { userList: Array<{ userID: string }> };
      total: number;
    };

    // 同页重复 → 第 2 页无新增即终止，不无限循环
    expect(membersList).toHaveBeenCalledTimes(2);
    expect(result.members.userList).toEqual([{ userID: 'u1' }]);
    expect(result.total).toBe(1);
  });

  it('stops at the page limit when hasMore never ends', async () => {
    let page = 0;
    const membersList = jest.fn().mockImplementation(() => {
      page += 1;
      return Promise.resolve({
        members: { userList: [{ userID: `u${page}` }] },
        hasMore: true,
      });
    });
    const service = createServiceWithMembers(membersList);

    const result = (await service.listAllMembers('admin')) as {
      members: { userList: Array<{ userID: string }> };
      total: number;
      hasMore: boolean;
    };

    // 每页都有新用户 → 不触发无进展终止，由 100 页上限兜底
    expect(membersList).toHaveBeenCalledTimes(100);
    expect(result.members.userList).toHaveLength(100);
    expect(result.total).toBe(100);
    expect(result.hasMore).toBe(false);
  });
});

describe('listMembers pagination param validation', () => {
  it('routes dirty pagination params to listAllMembers instead of SDK', async () => {
    const authzSDK = { members: { list: jest.fn() } };
    const roleManagerService = {
      listAllMembers: jest.fn().mockResolvedValue({}),
    };
    const controller = new (RoleManagerController as any)(
      authzSDK as any,
      roleManagerService as any,
      {},
    ) as RoleManagerController;

    await (controller as any).listMembers('admin', undefined, '0', 'abc');

    expect(roleManagerService.listAllMembers).toHaveBeenCalledWith(
      'admin',
      undefined,
    );
    expect(authzSDK.members.list).not.toHaveBeenCalled();
  });

  it('passes valid pagination numbers through to SDK', async () => {
    const authzSDK = { members: { list: jest.fn().mockResolvedValue({}) } };
    const roleManagerService = { listAllMembers: jest.fn() };
    const controller = new (RoleManagerController as any)(
      authzSDK as any,
      roleManagerService as any,
      {},
    ) as RoleManagerController;

    await (controller as any).listMembers('admin', 'user', '2', '50');

    expect(authzSDK.members.list).toHaveBeenCalledWith('admin', {
      type: 'user',
      page: 2,
      pageSize: 50,
    });
    expect(roleManagerService.listAllMembers).not.toHaveBeenCalled();
  });

  it('routes missing pagination to listAllMembers', async () => {
    const authzSDK = { members: { list: jest.fn() } };
    const roleManagerService = {
      listAllMembers: jest.fn().mockResolvedValue({}),
    };
    const controller = new (RoleManagerController as any)(
      authzSDK as any,
      roleManagerService as any,
      {},
    ) as RoleManagerController;

    await (controller as any).listMembers(
      'admin',
      undefined,
      undefined,
      undefined,
    );

    expect(roleManagerService.listAllMembers).toHaveBeenCalledWith(
      'admin',
      undefined,
    );
    expect(authzSDK.members.list).not.toHaveBeenCalled();
  });
});

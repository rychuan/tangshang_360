import { RoleManagerService } from './role-manager.service';
import { employee, rolePermissionConfig } from '@server/database/schema';

/**
 * 回归测试：角色成员判定不得把"包含管理员预设组"误判为全员成员。
 *
 * 平台角色成员配置为 presetGroup.isContainsAdmin: true 时，
 * 仅管理员预设组（应用开发者）属于该角色，普通员工不属于。
 * 旧逻辑 `allEmployees || isContainsAdmin || userListMatch`
 * 会导致所有用户被判定为 admin/hrd → 全局数据范围 → 团队绩效全员可见。
 *
 * 同时约束 fetchUserRoles 复用 roles.list 的 roleMembers 一次性判定，
 * 不得再对每个角色单独调用 members.list（N+1 外部调用）。
 */

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn((table: unknown) => {
      if (table === rolePermissionConfig) {
        // getAllPermissionConfigs: select(...).from(table) 直接 await
        return Promise.resolve([]);
      }
      // hasActiveEmployee: select(...).from(employee).where(...).limit(1)
      return {
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{}]),
        })),
      };
    }),
  })),
};

const mockAuthzSDK = {
  roles: { list: jest.fn() },
  members: { list: jest.fn() },
};

function roleWithMembers(bizID: string, roleMembers: Record<string, unknown>) {
  return { bizID, roleMembers };
}

describe('RoleManagerService 角色成员判定', () => {
  let service: RoleManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RoleManagerService(mockDb as never, mockAuthzSDK as never);
  });

  test('角色配置为"包含管理员预设组"且 userList 不含用户时，用户不属于该角色', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', {
          presetGroup: { isContainsAdmin: true },
          userList: [],
        }),
      ],
    });

    const roles = await service.getUserRoles('u_employee');

    expect(roles).not.toContain('admin');
  });

  test('角色配置为"全部员工"时，任何用户都属于该角色', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', {
          allEmployees: true,
          userList: [],
        }),
      ],
    });

    const roles = await service.getUserRoles('u_anyone');

    expect(roles).toContain('admin');
  });

  test('userList 显式包含用户时判定为成员', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', {
          userList: [{ userID: 'u_admin' }],
        }),
      ],
    });

    await expect(service.getUserRoles('u_admin')).resolves.toContain('admin');
    await expect(service.getUserRoles('u_other')).resolves.not.toContain(
      'admin',
    );
  });

  test('普通员工不被"管理员预设组"角色提升权限（checkUserPermission 拒绝）', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', {
          presetGroup: { isContainsAdmin: true },
          userList: [],
        }),
      ],
    });

    const hasPermission = await service.checkUserPermission(
      'u_employee',
      'team_performance',
      'view',
    );

    expect(hasPermission).toBe(false);
  });

  test('管理员预设组成员在 userList 展开时仍保留角色', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', {
          presetGroup: { isContainsAdmin: true },
          userList: [{ userID: 'u_real_admin' }],
        }),
      ],
    });

    const roles = await service.getUserRoles('u_real_admin');

    expect(roles).toContain('admin');
  });

  test('角色判定只调用 roles.list 一次，不再逐角色调 members.list（消除 N+1）', async () => {
    mockAuthzSDK.roles.list.mockResolvedValue({
      data: [
        roleWithMembers('admin', { userList: [] }),
        roleWithMembers('dept_head', { userList: [] }),
        roleWithMembers('employee', { userList: [] }),
      ],
    });

    const roles = await service.getUserRoles('u_employee');

    expect(roles).toEqual([]);
    expect(mockAuthzSDK.roles.list).toHaveBeenCalledWith({
      needMember: true,
      userID: 'u_employee',
    });
    expect(mockAuthzSDK.members.list).not.toHaveBeenCalled();
  });
});

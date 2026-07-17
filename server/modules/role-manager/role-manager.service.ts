import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  AuthorizationSDK,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { employee, rolePermissionConfig } from '@server/database/schema';
import type {
  RolePermissionConfig,
  PermissionItem,
} from '@shared/api.interface';
import {
  DEFAULT_PERMISSIONS,
  type PermissionResource,
  type PermissionAction,
} from '@shared/api.interface';

@Injectable()
export class RoleManagerService {
  private readonly logger = new Logger(RoleManagerService.name);
  private readonly roleCache = new Map<
    string,
    { roles: string[]; expiresAt: number }
  >();
  private readonly ROLE_CACHE_TTL_MS = 30_000;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authzSDK: AuthorizationSDK,
  ) {}

  invalidateUserRoleCache(userId: string): void {
    this.roleCache.delete(userId);
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const cached = this.roleCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) return cached.roles;

    try {
      const roles = await this.fetchUserRoles(userId, false);
      this.cacheUserRoles(userId, roles);
      return roles;
    } catch (err) {
      this.logger.error(
        `Failed to get user roles: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.cacheUserRoles(userId, []);
      return [];
    }
  }

  async getUserRolesStrict(userId: string): Promise<string[]> {
    const roles = await this.fetchUserRoles(userId, true);
    this.cacheUserRoles(userId, roles);
    return roles;
  }

  /**
   * 将用户添加到 'employee' 角色（新建员工时自动调用）
   */
  async addUserToEmployeeRole(userId: string): Promise<void> {
    try {
      const roles = await this.getUserRoles(userId);
      if (roles.includes('employee')) {
        this.logger.log(`User ${userId} already in 'employee' role, skipping`);
        return;
      }
      await this.authzSDK.members.add('employee', {
        members: { userList: [{ userID: userId }] },
      });
      // 角色变更后清除缓存，确保后续查询获取最新角色列表
      this.invalidateUserRoleCache(userId);
      this.logger.log(`Added user ${userId} to 'employee' role`);
    } catch (err) {
      this.logger.error(
        `Failed to add user ${userId} to 'employee' role: ${err instanceof Error ? err.message : String(err)}`,
      );
      // 不向上抛出，调用方已自行处理日志和流程
    }
  }

  /**
   * 确保用户拥有指定角色（幂等）
   */
  async ensureUserRole(userId: string, roleBizId: string): Promise<void> {
    try {
      const roles = await this.getUserRoles(userId);
      if (roles.includes(roleBizId)) {
        return;
      }
      await this.authzSDK.members.add(roleBizId, {
        members: { userList: [{ userID: userId }] },
      });
      this.invalidateUserRoleCache(userId);
      this.logger.log(`Added user ${userId} to role '${roleBizId}'`);
    } catch (err) {
      this.logger.error(
        `Failed to ensure user ${userId} in role '${roleBizId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 移除用户的指定角色（幂等）
   */
  async removeUserRole(userId: string, roleBizId: string): Promise<void> {
    try {
      const roles = await this.getUserRoles(userId);
      if (!roles.includes(roleBizId)) {
        return;
      }
      await this.authzSDK.members.remove(roleBizId, {
        members: { userList: [{ userID: userId }] },
      });
      this.invalidateUserRoleCache(userId);
      this.logger.log(`Removed user ${userId} from role '${roleBizId}'`);
    } catch (err) {
      this.logger.error(
        `Failed to remove user ${userId} from role '${roleBizId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async ensureUserRoleStrict(
    userId: string,
    roleBizId: string,
  ): Promise<void> {
    try {
      const roles = await this.getUserRolesStrict(userId);
      if (roles.includes(roleBizId)) {
        return;
      }
      await this.authzSDK.members.add(roleBizId, {
        members: { userList: [{ userID: userId }] },
      });
      this.logger.log(`Added user ${userId} to role '${roleBizId}'`);
    } finally {
      this.invalidateUserRoleCache(userId);
    }
  }

  async removeUserRoleStrict(
    userId: string,
    roleBizId: string,
  ): Promise<void> {
    try {
      const roles = await this.getUserRolesStrict(userId);
      if (!roles.includes(roleBizId)) {
        return;
      }
      await this.authzSDK.members.remove(roleBizId, {
        members: { userList: [{ userID: userId }] },
      });
      this.logger.log(`Removed user ${userId} from role '${roleBizId}'`);
    } finally {
      this.invalidateUserRoleCache(userId);
    }
  }

  /**
   * 同步用户角色：对比新旧角色列表，add 新增的，remove 移除的
   */
  async syncUserRoles(userId: string, newRoles: string[]): Promise<void> {
    try {
      const current = await this.getUserRoles(userId);
      const toAdd = newRoles.filter((r: string) => !current.includes(r));
      const toRemove = current.filter((r: string) => !newRoles.includes(r));

      for (const role of toAdd) {
        try {
          await this.ensureUserRole(userId, role);
        } catch {
          // 单个角色添加失败不中断
        }
      }
      for (const role of toRemove) {
        try {
          await this.removeUserRole(userId, role);
        } catch {
          // 单个角色移除失败不中断
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to sync roles for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async syncUserRolesStrict(
    userId: string,
    newRoles: string[],
  ): Promise<void> {
    try {
      const current = await this.getUserRolesStrict(userId);
      const toAdd = newRoles.filter((role) => !current.includes(role));
      const toRemove = current.filter((role) => !newRoles.includes(role));

      for (const role of toAdd) {
        await this.authzSDK.members.add(role, {
          members: { userList: [{ userID: userId }] },
        });
      }
      for (const role of toRemove) {
        await this.authzSDK.members.remove(role, {
          members: { userList: [{ userID: userId }] },
        });
      }
    } finally {
      this.invalidateUserRoleCache(userId);
    }
  }

  async getPermissionConfig(
    roleBizId: string,
  ): Promise<RolePermissionConfig | null> {
    const rows = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return {
      roleBizId: rows[0].roleBizId,
      permissions: rows[0].permissions as PermissionItem[],
    };
  }

  async upsertPermissionConfig(
    roleBizId: string,
    permissions: PermissionItem[],
  ): Promise<void> {
    const existing = await this.db
      .select({ id: rolePermissionConfig.id })
      .from(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(rolePermissionConfig)
        .set({ permissions })
        .where(eq(rolePermissionConfig.roleBizId, roleBizId));
    } else {
      await this.db
        .insert(rolePermissionConfig)
        .values({ roleBizId, permissions });
    }

    this.logger.log(`Permission config updated for role: ${roleBizId}`);
  }

  async deletePermissionConfig(roleBizId: string): Promise<void> {
    await this.db
      .delete(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId));
  }

  async getAllPermissionConfigs(): Promise<RolePermissionConfig[]> {
    const rows = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig);

    return rows.map((row) => ({
      roleBizId: row.roleBizId,
      permissions: row.permissions as PermissionItem[],
    }));
  }

  /**
   * 检查用户是否拥有某个资源的操作权限
   * 用户拥有多个角色时取权限并集
   */
  async checkUserPermission(
    userId: string,
    resource: PermissionResource,
    action: PermissionAction,
  ): Promise<boolean> {
    if (!(await this.hasActiveEmployee(userId))) return false;

    const userRoles = await this.getUserRoles(userId);
    if (userRoles.length === 0) return false;

    // 一次查询获取所有角色的自定义权限配置
    const configs = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig)
      .where(inArray(rolePermissionConfig.roleBizId, userRoles));

    const configMap = new Map<string, PermissionItem[]>();
    for (const config of configs) {
      configMap.set(
        config.roleBizId,
        (config.permissions as PermissionItem[]) || [],
      );
    }

    // 对每个角色，取自定义配置，无则回退 DEFAULT_PERMISSIONS
    for (const role of userRoles) {
      const permissions =
        configMap.get(role) ||
        (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[role] ||
        [];

      for (const item of permissions) {
        if (item.resource === resource && item.actions.includes(action)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 获取当前用户所有角色的有效权限（取并集）
   */
  async getUserEffectivePermissions(userId: string): Promise<PermissionItem[]> {
    if (!(await this.hasActiveEmployee(userId))) return [];

    const userRoles = await this.getUserRoles(userId);
    if (userRoles.length === 0) return [];

    // 一次查询获取所有角色的自定义权限配置
    const configs = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig)
      .where(inArray(rolePermissionConfig.roleBizId, userRoles));

    const configMap = new Map<string, PermissionItem[]>();
    for (const config of configs) {
      configMap.set(
        config.roleBizId,
        (config.permissions as PermissionItem[]) || [],
      );
    }

    // 合并所有角色的权限（资源级别合并，action 取并集）
    const mergedMap = new Map<PermissionResource, Set<PermissionAction>>();

    for (const role of userRoles) {
      const permissions =
        configMap.get(role) ||
        (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[role] ||
        [];

      for (const item of permissions) {
        if (!mergedMap.has(item.resource)) {
          mergedMap.set(item.resource, new Set());
        }
        for (const action of item.actions) {
          mergedMap.get(item.resource)!.add(action);
        }
      }
    }

    return Array.from(mergedMap.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }));
  }

  private async hasActiveEmployee(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${userId}`,
          isNull(employee.deletedAt),
          eq(employee.status, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  private cacheUserRoles(userId: string, roles: string[]): void {
    this.roleCache.set(userId, {
      roles,
      expiresAt: Date.now() + this.ROLE_CACHE_TTL_MS,
    });
  }

  private async fetchUserRoles(
    userId: string,
    strict: boolean,
  ): Promise<string[]> {
    const allRoles = await this.authzSDK.roles.list();
    const rolePayload = this.unwrapSdkData(allRoles);
    const roleList = Array.isArray(rolePayload)
      ? rolePayload
      : (rolePayload as any)?.items || (rolePayload as any)?.roles || [];
    const roles: string[] = [];

    for (const role of roleList) {
      const bizID = role.bizID;
      if (!bizID) continue;
      if (await this.isUserInRole(userId, bizID, strict)) {
        roles.push(bizID);
      }
    }

    return roles;
  }

  private async isUserInRole(
    userId: string,
    roleBizId: string,
    strict: boolean,
  ): Promise<boolean> {
    let page = 1;
    while (true) {
      let membersResult: unknown;
      try {
        membersResult = await this.authzSDK.members.list(roleBizId, {
          page,
          pageSize: 999,
        });
      } catch (err) {
        if (strict) {
          throw err;
        }
        this.logger.warn(
          `Failed to list members for role ${roleBizId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }

      const memberPayload = this.unwrapSdkData(membersResult);
      const members =
        (memberPayload as any)?.members || memberPayload || {};
      const isMember =
        Boolean((members as any).allEmployees) ||
        Boolean((members as any).presetGroup?.isContainsAdmin) ||
        (Array.isArray((members as any).userList) &&
          (members as any).userList.some(
            (user: any) =>
              user.userID === userId || user.user_id === userId,
          ));
      if (isMember) {
        return true;
      }
      if (!(memberPayload as any)?.hasMore) {
        return false;
      }
      page += 1;
    }
  }

  private unwrapSdkData(value: unknown): unknown {
    if (
      value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, 'data')
    ) {
      return (value as { data: unknown }).data;
    }
    return value;
  }
}

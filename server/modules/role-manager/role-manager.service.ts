import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  AuthorizationSDK,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, inArray } from 'drizzle-orm';
import { rolePermissionConfig } from '@server/database/schema';
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

  async getUserRoles(userId: string): Promise<string[]> {
    const cached = this.roleCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) return cached.roles;

    const roles: string[] = [];
    try {
      const allRoles = await this.authzSDK.roles.list();
      const roleList = Array.isArray(allRoles)
        ? allRoles
        : (allRoles as any).items || [];
      for (const role of roleList) {
        const bizID = role.bizID;
        if (!bizID) continue;
        let isMember = false;
        try {
          const membersResult = await this.authzSDK.members.list(bizID, {
            pageSize: 999,
          });
          const members = (membersResult as any).members || membersResult || {};
          if (members.allEmployees) {
            isMember = true;
          }
          if (!isMember && members.presetGroup?.isContainsAdmin) {
            isMember = true;
          }
          if (!isMember && Array.isArray(members.userList)) {
            isMember = members.userList.some(
              (u: any) => u.userID === userId || u.user_id === userId,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to list members for role ${bizID}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (isMember) {
          roles.push(bizID);
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to get user roles: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.roleCache.set(userId, {
      roles,
      expiresAt: Date.now() + this.ROLE_CACHE_TTL_MS,
    });
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
      this.roleCache.delete(userId);
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
      this.roleCache.delete(userId);
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
      this.roleCache.delete(userId);
      this.logger.log(`Removed user ${userId} from role '${roleBizId}'`);
    } catch (err) {
      this.logger.error(
        `Failed to remove user ${userId} from role '${roleBizId}': ${err instanceof Error ? err.message : String(err)}`,
      );
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
}

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

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authzSDK: AuthorizationSDK,
  ) {}

  async getUserRoles(userId: string): Promise<string[]> {
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
      this.logger.log(`Added user ${userId} to 'employee' role`);
    } catch (err) {
      this.logger.error(
        `Failed to add user ${userId} to 'employee' role: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
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

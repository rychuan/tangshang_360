import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
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
  RoleMemberMutationOutcome,
  RoleMemberMutationOutcomeStatus,
  RoleMemberMutationResponse,
} from '@shared/api.interface';
import {
  DEFAULT_PERMISSIONS,
  type PermissionResource,
  type PermissionAction,
} from '@shared/api.interface';
import {
  isBuiltinRole,
  normalizePermissionConfig,
} from '@shared/types/permission.types';
import {
  isStringArray,
  normalizeAuthorizationRoles,
} from './authorization-state';

type CustomRoleMemberMutation = 'add' | 'remove';
type AuthorizationProcessStatus = Exclude<
  RoleMemberMutationOutcomeStatus,
  'unchanged'
>;

type AuthorizationSyncGateway = {
  stageAuthorizationChange(
    tx: PostgresJsDatabase,
    employeeId: string,
    desiredRoles: string[],
  ): Promise<number>;
  processEmployeeAuthorization(
    employeeId: string,
    version?: number,
  ): Promise<{
    status: AuthorizationProcessStatus;
    version: number;
    error?: string;
  }>;
};

@Injectable()
export class RoleManagerService {
  private readonly logger = new Logger(RoleManagerService.name);
  private readonly roleCache = new Map<
    string,
    { roles: string[]; expiresAt: number }
  >();
  private readonly ROLE_CACHE_TTL_MS = 10_000;

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
      throw new Error(`无法获取用户角色（AuthorizationSDK 不可用）: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getUserRolesStrict(userId: string): Promise<string[]> {
    const roles = await this.fetchUserRoles(userId, true);
    this.cacheUserRoles(userId, roles);
    return roles;
  }

  /**
   * 将用户添加到 'employee' 角色（新建员工时自动调用）
   * @deprecated 直接操作 SDK 角色，绕过 durable authorization staging。请使用 reconciliation 路径（AuthorizationSyncService.stageAuthorizationChange + processEmployeeAuthorization）。
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
   * @deprecated 直接操作 SDK 角色，绕过 durable authorization staging。请使用 reconciliation 路径或 ensureUserRoleStrict。
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
   * @deprecated 直接操作 SDK 角色，绕过 durable authorization staging。请使用 reconciliation 路径或 removeUserRoleStrict。
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

  async ensureUserRoleStrict(userId: string, roleBizId: string): Promise<void> {
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

  async removeUserRoleStrict(userId: string, roleBizId: string): Promise<void> {
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
   * @deprecated 直接操作 SDK 角色，绕过 durable authorization staging。请使用 reconciliation 路径或 syncUserRolesStrict。
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

  async syncUserRolesStrict(userId: string, newRoles: string[]): Promise<void> {
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

  async reconcileUserRoles(
    userId: string,
    desiredRoles: string[],
  ): Promise<void> {
    const desired = normalizeAuthorizationRoles(desiredRoles);

    try {
      const current = normalizeAuthorizationRoles(
        await this.getUserRolesStrict(userId),
      );
      const toRemove = current.filter((role) => !desired.includes(role));
      const toAdd = desired.filter((role) => !current.includes(role));

      for (const role of toRemove) {
        await this.authzSDK.members.remove(role, {
          members: { userList: [{ userID: userId }] },
        });
      }

      for (const role of toAdd) {
        await this.authzSDK.members.add(role, {
          members: { userList: [{ userID: userId }] },
        });
      }

      const verified = normalizeAuthorizationRoles(
        await this.getUserRolesStrict(userId),
      );
      if (
        verified.length !== desired.length ||
        verified.some((role, index) => role !== desired[index])
      ) {
        throw new Error(
          `Authorization role reconciliation mismatch for user ${userId}`,
        );
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
    let normalizedPermissions: PermissionItem[];
    try {
      normalizedPermissions = normalizePermissionConfig(roleBizId, permissions);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '权限配置无效',
      );
    }

    const existing = await this.db
      .select({ id: rolePermissionConfig.id })
      .from(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(rolePermissionConfig)
        .set({ permissions: normalizedPermissions })
        .where(eq(rolePermissionConfig.roleBizId, roleBizId));
    } else {
      await this.db
        .insert(rolePermissionConfig)
        .values({ roleBizId, permissions: normalizedPermissions });
    }

    this.logger.log(`Permission config updated for role: ${roleBizId}`);
  }

  async mutateCustomRoleMembers(
    roleBizId: string,
    userIds: string[],
    mutation: CustomRoleMemberMutation,
    authorizationSyncService: AuthorizationSyncGateway,
  ): Promise<RoleMemberMutationResponse> {
    if (isBuiltinRole(roleBizId)) {
      throw new BadRequestException('内置角色成员只能通过员工或部门管理修改');
    }

    const normalizedUserIds = Array.from(
      new Set(userIds.map((userId) => userId.trim()).filter(Boolean)),
    );
    if (normalizedUserIds.length === 0) {
      throw new BadRequestException('成员列表不能为空');
    }
    normalizedUserIds.sort((left, right) => left.localeCompare(right));

    const staged = await this.db.transaction(async (tx) => {
      await this.lockCustomRole(tx, roleBizId);
      const userIdColumn = sql<string>`(${employee.employeeId}).user_id`;
      const rows = await tx
        .select({
          employeeId: userIdColumn,
          status: employee.status,
          deletedAt: employee.deletedAt,
          authorizationRoles: employee.authorizationRoles,
          authorizationStatus: employee.authorizationStatus,
          authorizationVersion: employee.authorizationVersion,
        })
        .from(employee)
        .where(inArray(userIdColumn, normalizedUserIds))
        .orderBy(userIdColumn)
        .for('update');
      const rowByUserId = new Map(rows.map((row) => [row.employeeId, row]));
      const validated = normalizedUserIds.map((userId) => {
        const current = rowByUserId.get(userId);
        if (!current || !current.status || current.deletedAt != null) {
          throw new BadRequestException(`员工 ${userId} 不存在或已停用`);
        }
        const roles = current.authorizationRoles;
        if (!isStringArray(roles)) {
          throw new BadRequestException(`员工 ${userId} 的授权角色数据无效`);
        }
        return { ...current, authorizationRoles: roles };
      });

      const changes: Array<
        | { userId: string; version: number }
        | { userId: string; unchanged: true }
      > = [];
      for (const current of validated) {
        const currentRoles = normalizeAuthorizationRoles(
          current.authorizationRoles,
        );
        const desiredRoles = normalizeAuthorizationRoles(
          mutation === 'add'
            ? [...currentRoles, roleBizId]
            : currentRoles.filter((role) => role !== roleBizId),
        );
        if (this.sameRoles(currentRoles, desiredRoles)) {
          if (
            current.authorizationStatus === 'pending' ||
            current.authorizationStatus === 'failed'
          ) {
            changes.push({
              userId: current.employeeId,
              version: current.authorizationVersion,
            });
          } else {
            changes.push({ userId: current.employeeId, unchanged: true });
          }
          continue;
        }
        const version = await authorizationSyncService.stageAuthorizationChange(
          tx,
          current.employeeId,
          desiredRoles,
        );
        changes.push({ userId: current.employeeId, version });
      }
      return changes;
    });

    const processed = await Promise.all(
      staged.map(async (change): Promise<RoleMemberMutationOutcome> => {
        if ('unchanged' in change) {
          return { userId: change.userId, status: 'unchanged' };
        }
        try {
          const result =
            await authorizationSyncService.processEmployeeAuthorization(
              change.userId,
              change.version,
            );
          return {
            userId: change.userId,
            status: result.status,
            version: result.version,
            ...(result.error ? { error: result.error } : {}),
          };
        } catch (error) {
          return {
            userId: change.userId,
            status: 'failed',
            version: change.version,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return {
      success: processed.every(
        (outcome) =>
          outcome.status === 'synced' || outcome.status === 'unchanged',
      ),
      outcomes: processed,
    };
  }

  async deleteCustomRole(
    roleBizId: string,
    deleteFromSdk: () => Promise<unknown>,
  ): Promise<unknown> {
    if (isBuiltinRole(roleBizId)) {
      throw new BadRequestException('内置角色不可删除');
    }

    return this.db.transaction(async (tx) => {
      await this.lockCustomRole(tx, roleBizId);
      const durableMembers = await tx
        .select({
          employeeId: sql<string>`(${employee.employeeId}).user_id`,
        })
        .from(employee)
        .where(
          sql`COALESCE(${employee.authorizationRoles}, '[]'::jsonb) ? ${roleBizId}`,
        )
        .limit(1);
      if (durableMembers.length > 0) {
        throw new BadRequestException('角色仍有成员，请先移除全部成员后再删除');
      }

      const sdkResult = await deleteFromSdk();

      await tx
        .delete(rolePermissionConfig)
        .where(eq(rolePermissionConfig.roleBizId, roleBizId));
      return sdkResult;
    });
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

  async hasActiveEmployee(userId: string): Promise<boolean> {
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

  private async lockCustomRole(
    tx: PostgresJsDatabase,
    roleBizId: string,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`custom-role:${roleBizId}`}, 0))`,
    );
  }

  private sameRoles(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every((role, index) => role === right[index])
    );
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
      const members = (memberPayload as any)?.members || memberPayload || {};
      const isMember =
        Boolean((members as any).allEmployees) ||
        Boolean((members as any).presetGroup?.isContainsAdmin) ||
        (Array.isArray((members as any).userList) &&
          (members as any).userList.some(
            (user: any) => user.userID === userId || user.user_id === userId,
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

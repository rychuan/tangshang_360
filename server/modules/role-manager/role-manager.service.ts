import {
  BadRequestException,
  ForbiddenException,
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
  private readonly ROLE_CACHE_TTL_MS = 60_000;
  private readonly PERM_CONFIG_CACHE_TTL_MS = 300_000; // 5 分钟
  private permissionConfigCache: Map<string, PermissionItem[]> | null = null;
  private permissionConfigCacheExpiresAt = 0;

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
      throw new Error(
        `无法获取用户角色（AuthorizationSDK 不可用）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getUserRolesStrict(userId: string): Promise<string[]> {
    const roles = await this.fetchUserRoles(userId, true);
    this.cacheUserRoles(userId, roles);
    return roles;
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

      let verified = normalizeAuthorizationRoles(
        await this.getUserRolesStrict(userId),
      );
      let attempt = 0;
      const isMatched = (): boolean =>
        verified.length === desired.length &&
        verified.every((role, index) => role === desired[index]);
      while (!isMatched() && attempt < 3) {
        attempt++;
        this.logger.warn(
          `reconcile ${userId}: verified=${JSON.stringify(verified)} != desired=${JSON.stringify(desired)}, retry ${attempt}/3`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        this.invalidateUserRoleCache(userId);
        verified = normalizeAuthorizationRoles(
          await this.getUserRolesStrict(userId),
        );
      }
      this.logger.log(
        `reconcile ${userId}: current=${JSON.stringify(current)} desired=${JSON.stringify(desired)} verified=${JSON.stringify(verified)} toRemove=${JSON.stringify(toRemove)} toAdd=${JSON.stringify(toAdd)} retries=${attempt}`,
      );
      if (!isMatched()) {
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

    const raw = rows[0].permissions as PermissionItem[];
    let permissions = raw;
    try {
      permissions = normalizePermissionConfig(roleBizId, raw);
    } catch {
      // If stored data is invalid, return as-is; will be fixed on next save
    }
    return {
      roleBizId: rows[0].roleBizId,
      permissions,
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

    this.invalidatePermissionConfigCache();
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
      this.invalidatePermissionConfigCache();
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

  /** 获取所有权限配置（5 分钟缓存），减少重复 DB 查询 */
  private async getCachedPermissionConfigMap(): Promise<
    Map<string, PermissionItem[]>
  > {
    const now = Date.now();
    if (
      this.permissionConfigCache &&
      now < this.permissionConfigCacheExpiresAt
    ) {
      return this.permissionConfigCache;
    }
    const configs = await this.getAllPermissionConfigs();
    this.permissionConfigCache = new Map(
      configs.map((c) => [c.roleBizId, c.permissions]),
    );
    this.permissionConfigCacheExpiresAt = now + this.PERM_CONFIG_CACHE_TTL_MS;
    return this.permissionConfigCache;
  }

  /** 清除权限配置缓存（upsert/delete 时调用） */
  invalidatePermissionConfigCache(): void {
    this.permissionConfigCache = null;
    this.permissionConfigCacheExpiresAt = 0;
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

    if (!userRoles.includes('admin')) {
      if (!(await this.hasActiveEmployee(userId))) return false;
    }

    const configMap = await this.getCachedPermissionConfigMap();

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

    if (!userRoles.includes('admin')) {
      if (!(await this.hasActiveEmployee(userId))) return [];
    }

    const configMap = await this.getCachedPermissionConfigMap();

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

  async bootstrapAdmin(
    userId: string,
  ): Promise<'already_admin' | 'bootstrapped'> {
    const roles = await this.getUserRoles(userId);
    if (roles.includes('admin')) {
      return 'already_admin';
    }

    if (process.env.NODE_ENV === 'production') {
      const allRoles = await this.authzSDK.roles.list({ needMember: true });
      const rolePayload = this.unwrapSdkData(allRoles);
      const roleList = Array.isArray(rolePayload)
        ? rolePayload
        : (rolePayload as Record<string, unknown>)?.items as unknown[] ||
          (rolePayload as Record<string, unknown>)?.roles as unknown[] ||
          [];

      const adminRole = (roleList as Array<Record<string, unknown>>).find(
        (r) => r?.bizID === 'admin',
      );
      const adminMembers = (adminRole?.roleMembers ?? {}) as Record<string, unknown>;
      const hasAdmin =
        Boolean(adminMembers.allEmployees) ||
        (Array.isArray(adminMembers.userList) &&
          (adminMembers.userList as unknown[]).length > 0);

      if (hasAdmin) {
        throw new ForbiddenException('已存在管理员，请联系管理员添加');
      }
    }

    await this.authzSDK.members.add('admin', {
      members: { userList: [{ userID: userId }] },
    });

    this.invalidateUserRoleCache(userId);
    return 'bootstrapped';
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
    // roles.list({ userID }) 让平台按用户返回每个角色的成员名单（roleMembers），
    // 一次外部调用完成全部角色判定，避免对每个角色单独调 members.list 造成 N+1
    const allRoles = await this.authzSDK.roles.list({
      needMember: true,
      userID: userId,
    });
    const rolePayload = this.unwrapSdkData(allRoles);
    const roleList = Array.isArray(rolePayload)
      ? rolePayload
      : (rolePayload as any)?.items || (rolePayload as any)?.roles || [];

    const roles: string[] = [];
    for (const role of roleList) {
      const bizID = (role as any)?.bizID;
      if (!bizID) continue;
      if (
        this.isUserInRoleMembers(userId, (role as any)?.roleMembers, strict)
      ) {
        roles.push(bizID);
      }
    }
    return roles;
  }

  private isUserInRoleMembers(
    userId: string,
    roleMembers: unknown,
    strict: boolean,
  ): boolean {
    const members = (roleMembers ?? {}) as Record<string, unknown>;
    const allEmployees = Boolean(members.allEmployees);
    // 注意：presetGroup.isContainsAdmin 表示成员来源为"管理员预设组"（应用开发者，
    // 少数人的集合），不能据此判定所有用户均为成员 —— 该角色只属于显式名单/展开成员
    const userListMatch =
      Array.isArray(members.userList) &&
      (members.userList as Array<{ userID?: string; user_id?: string }>).some(
        (user) => user.userID === userId || user.user_id === userId,
      );
    return strict ? userListMatch : allEmployees || userListMatch;
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

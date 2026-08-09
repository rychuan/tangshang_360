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
import { auditLog, employee, rolePermissionConfig } from '@server/database/schema';
import type {
  RolePermissionConfig,
  PermissionItem,
  RoleMemberMutationOutcome,
  RoleMemberMutationOutcomeStatus,
  RoleMemberMutationResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
} from '@shared/api.interface';
import {
  DEFAULT_PERMISSIONS,
  type PermissionResource,
  type PermissionAction,
} from '@shared/api.interface';
import {
  isBuiltinRole,
  normalizePermissionConfig,
  sanitizePermissionConfig,
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
    // 严格模式仅用于 reconcile 校验（只认显式 userList 成员）。
    // 不写共享缓存：strict 结果只是显式子集，写缓存会污染非严格判定（含 allEmployees）
    return this.fetchUserRoles(userId, true);
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

      // 复核：desired 的每个角色被「显式成员」或「企业全员(allEmployees)」任一满足即算匹配。
      // 平台角色若配置为 allEmployees（全员成员），SDK 不会把它展开进 userList，
      // 纯 strict 校验会永远不匹配导致对账误报失败（员工 create 直接抛错）。
      let verified = await this.fetchUserRolesWithDetail(userId);
      let attempt = 0;
      const isMatched = (): boolean => {
        const satisfied = new Set([...verified.explicit, ...verified.implicit]);
        return desired.every((role) => satisfied.has(role));
      };
      while (!isMatched() && attempt < 3) {
        attempt++;
        this.logger.warn(
          `reconcile ${userId}: verified=${JSON.stringify(verified)} != desired=${JSON.stringify(desired)}, retry ${attempt}/3`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        this.invalidateUserRoleCache(userId);
        verified = await this.fetchUserRolesWithDetail(userId);
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
      permissions = sanitizePermissionConfig(raw);
    }
    return {
      roleBizId: rows[0].roleBizId,
      permissions,
    };
  }

  async upsertPermissionConfig(
    roleBizId: string,
    permissions: PermissionItem[],
    operatorId: string,
  ): Promise<void> {
    const sanitized = sanitizePermissionConfig(permissions);
    let normalizedPermissions: PermissionItem[];
    try {
      normalizedPermissions = normalizePermissionConfig(roleBizId, sanitized);
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
    await this.db.insert(auditLog).values({
      operatorId,
      action: 'update_role_permissions',
      targetType: 'role',
      targetId: roleBizId,
      changes: { permissions: normalizedPermissions },
    });
    this.logger.log(`Permission config updated for role: ${roleBizId}`);
  }

  /** 创建自定义角色（SDK 透传 + 审计） */
  async createRole(
    dto: CreateRoleRequest,
    operatorId: string,
  ): Promise<unknown> {
    const result = await this.authzSDK.roles.create(dto);
    await this.db.insert(auditLog).values({
      operatorId,
      action: 'create_role',
      targetType: 'role',
      targetId: dto.role?.bizID ?? '',
      changes: { role: dto.role },
    });
    return result;
  }

  /** 更新自定义角色（SDK 透传 + 审计） */
  async updateRole(
    bizID: string,
    dto: UpdateRoleRequest,
    operatorId: string,
  ): Promise<unknown> {
    const result = await this.authzSDK.roles.update(bizID, dto);
    await this.db.insert(auditLog).values({
      operatorId,
      action: 'update_role',
      targetType: 'role',
      targetId: bizID,
      changes: { role: dto.role },
    });
    return result;
  }

  async mutateCustomRoleMembers(
    roleBizId: string,
    userIds: string[],
    mutation: CustomRoleMemberMutation,
    authorizationSyncService: AuthorizationSyncGateway,
    operatorId: string,
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
      await tx.insert(auditLog).values({
        operatorId,
        action:
          mutation === 'add'
            ? 'custom_role_add_member'
            : 'custom_role_remove_member',
        targetType: 'role',
        targetId: roleBizId,
        changes: { memberIds: normalizedUserIds },
      });
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
    operatorId: string,
  ): Promise<unknown> {
    if (isBuiltinRole(roleBizId)) {
      throw new BadRequestException('内置角色不可删除');
    }

    // 二次确认：DB durable 成员之外，还可能存在经平台 UI/其他途径直接加入的 SDK 成员；
    // 先做 SDK 侧检查，避免删除后留下孤儿成员引用（后续 reconcile 会失败）
    let sdkUserCount = 0;
    try {
      const sdkMembers = await this.listAllMembers(roleBizId, 'User');
      const members = (sdkMembers as { members?: Record<string, unknown> })
        ?.members ?? {};
      sdkUserCount = Array.isArray(members.userList)
        ? members.userList.length
        : 0;
    } catch (error) {
      this.logger.warn(
        `deleteCustomRole ${roleBizId}: SDK member check skipped (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (sdkUserCount > 0) {
      throw new BadRequestException(
        `角色在平台侧仍有 ${sdkUserCount} 个成员，请先移除全部成员后再删除`,
      );
    }

    return this.db.transaction(async (tx) => {
      await this.lockCustomRole(tx, roleBizId);
      const durableMembers = await tx
        .select({
          employeeId: sql<string>`(${employee.employeeId}).user_id`,
        })
        .from(employee)
        .where(
          sql`jsonb_exists(COALESCE(${employee.authorizationRoles}, '[]'::jsonb), ${roleBizId})`,
        )
        .limit(1);
      if (durableMembers.length > 0) {
        throw new BadRequestException('角色仍有成员，请先移除全部成员后再删除');
      }

      const sdkResult = await deleteFromSdk();

      await tx
        .delete(rolePermissionConfig)
        .where(eq(rolePermissionConfig.roleBizId, roleBizId));
      await tx.insert(auditLog).values({
        operatorId,
        action: 'delete_role',
        targetType: 'role',
        targetId: roleBizId,
      });
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

    return rows.map((row) => {
      const raw = row.permissions as PermissionItem[];
      try {
        return {
          roleBizId: row.roleBizId,
          permissions: normalizePermissionConfig(row.roleBizId, raw),
        };
      } catch {
        return {
          roleBizId: row.roleBizId,
          permissions: sanitizePermissionConfig(raw),
        };
      }
    });
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
    authorizationSyncService: AuthorizationSyncGateway,
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
        : ((rolePayload as Record<string, unknown>)?.items as unknown[]) ||
          ((rolePayload as Record<string, unknown>)?.roles as unknown[]) ||
          [];

      const adminRole = (roleList as Array<Record<string, unknown>>).find(
        (r) => r?.bizID === 'admin',
      );
      const adminMembers = (adminRole?.roleMembers ?? {}) as Record<
        string,
        unknown
      >;
      const hasAdmin =
        Boolean(adminMembers.allEmployees) ||
        (Array.isArray(adminMembers.userList) &&
          (adminMembers.userList as unknown[]).length > 0);

      if (hasAdmin) {
        throw new ForbiddenException('已存在管理员，请联系管理员添加');
      }
    }

    // 优先走标准同步链路：写 durable 期望角色 + 建 job + reconcile（与员工/部门/角色成员变更一致）。
    // 避免直接 members.add 绕过持久化——否则 admin 数量保护统计不到该用户，
    // 且后续任何 reconcile 会用 durable 角色（不含 admin）把 SDK 里的 admin 移除。
    const rows = await this.db
      .select({
        employeeId: sql<string>`(${employee.employeeId}).user_id`,
        status: employee.status,
        deletedAt: employee.deletedAt,
        authorizationRoles: employee.authorizationRoles,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${userId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    const employeeRow = rows[0];

    if (
      employeeRow &&
      employeeRow.status &&
      employeeRow.deletedAt == null &&
      isStringArray(employeeRow.authorizationRoles)
    ) {
      const currentRoles = normalizeAuthorizationRoles(
        employeeRow.authorizationRoles,
      );
      if (!currentRoles.includes('admin')) {
        const desiredRoles = normalizeAuthorizationRoles([
          ...currentRoles,
          'admin',
        ]);
        const version = await authorizationSyncService.stageAuthorizationChange(
          this.db,
          userId,
          desiredRoles,
        );
        const result =
          await authorizationSyncService.processEmployeeAuthorization(
            userId,
            version,
          );
        if (result.status !== 'synced') {
          throw new Error(
            result.error ||
              `管理员授权同步失败（${result.status}），请稍后重试`,
          );
        }
      }
      this.invalidateUserRoleCache(userId);
      return 'bootstrapped';
    }

    // 无有效员工档案（引导期用户可能尚未建档）：退化为直接 SDK 加成员，
    // 后续该用户建档/更新时会按 durable 角色对账
    this.logger.warn(
      `bootstrapAdmin ${userId}: no active employee profile, falling back to direct SDK members.add`,
    );
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
    const { explicit, implicit } = await this.fetchUserRolesWithDetail(userId);
    const roles = strict ? explicit : [...explicit, ...implicit];

    if (roles.length === 0 && !strict) {
      // 降级容错：SDK 判定用户不属于任何角色时，回退读取本地 durable 期望角色
      // authorizationRoles（而非 legacy employee.role 列 —— 后者不随 dept_head 派生、
      // 自定义角色增删同步，可能授出陈旧角色）。仅授权已同步（synced）的有效员工可回退
      // ——同步中（pending/failed）不授予，避免 SDK 角色回收后本地残留被误授（fails closed）
      const rows: { authorizationRoles: unknown }[] = await this.db
        .select({ authorizationRoles: employee.authorizationRoles })
        .from(employee)
        .where(
          and(
            sql`(${employee.employeeId}).user_id = ${userId}`,
            eq(employee.status, true),
            isNull(employee.deletedAt),
            eq(employee.authorizationStatus, 'synced'),
          ),
        )
        .limit(1);
      if (rows.length > 0 && isStringArray(rows[0].authorizationRoles)) {
        const fallbackRoles = normalizeAuthorizationRoles(
          rows[0].authorizationRoles,
        );
        this.logger.warn(
          `User ${userId} has no SDK roles, falling back to durable authorizationRoles: [${fallbackRoles.join(', ')}]`,
        );
        return fallbackRoles;
      }
    }

    return roles;
  }

  /**
   * 拉取平台角色并区分成员来源：
   * - explicit：用户在角色显式 userList 中（可被 reconcile 精确增删）
   * - implicit：角色配置为 allEmployees（企业全员），无需也不应逐用户增删
   * roles.list({ userID }) 让平台按用户返回每个角色的成员名单（roleMembers），
   * 一次外部调用完成全部角色判定，避免对每个角色单独调 members.list 造成 N+1
   */
  private async fetchUserRolesWithDetail(
    userId: string,
  ): Promise<{ explicit: string[]; implicit: string[] }> {
    const allRoles = await this.authzSDK.roles.list({
      needMember: true,
      userID: userId,
    });
    const rolePayload = this.unwrapSdkData(allRoles);
    const roleList = Array.isArray(rolePayload)
      ? rolePayload
      : (rolePayload as any)?.items || (rolePayload as any)?.roles || [];

    const explicit: string[] = [];
    const implicit: string[] = [];
    for (const role of roleList) {
      const bizID = (role as any)?.bizID;
      if (!bizID) continue;
      const roleMembers = (role as any)?.roleMembers;
      if (this.isUserInRoleMembers(userId, roleMembers, true)) {
        explicit.push(bizID);
      } else if ((roleMembers ?? {})?.allEmployees) {
        implicit.push(bizID);
      }
    }

    return { explicit, implicit };
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

  async listAllMembers(bizID: string, type?: string): Promise<unknown> {
    // 平台默认每页约 50 条；100 页上限（5000 成员）防 SDK 分页异常导致无限循环
    const PAGE_SIZE = 50;
    const MAX_PAGES = 100;
    let page = 1;
    let hasMore = true;
    const allUserList: Array<Record<string, unknown>> = [];
    const allDeptList: Array<Record<string, unknown>> = [];
    const allChatList: Array<Record<string, unknown>> = [];
    const seenUserKeys = new Set<string>();
    let meta: Record<string, unknown> = {};

    while (hasMore && page <= MAX_PAGES) {
      const res = await this.authzSDK.members.list(bizID, {
        type: type as any,
        page,
        pageSize: PAGE_SIZE,
      });
      const data = this.unwrapSdkData(res) as {
        members?: Record<string, unknown>;
        hasMore?: boolean;
      };
      const members = data?.members ?? (data as Record<string, unknown>);
      const userList = (members?.userList ?? []) as Array<
        Record<string, unknown>
      >;
      const deptList = (members?.departmentList ?? []) as Array<
        Record<string, unknown>
      >;
      const chatList = (members?.groupChatList ?? []) as Array<
        Record<string, unknown>
      >;

      // 角色级 meta（allEmployees/public/presetGroup）取第一页，避免逐页覆盖翻转语义
      if (page === 1) {
        meta = {
          allEmployees: members?.allEmployees ?? false,
          public: members?.public ?? false,
          presetGroup: members?.presetGroup ?? { isContainsAdmin: false },
        };
      }

      // 按 userID 去重，防御 SDK 分页重复页导致列表重复/total 虚高
      const freshUsers = userList.filter((user) => {
        const key = String(
          (user as { userID?: string })?.userID ??
            (user as { user_id?: string })?.user_id ??
            '',
        );
        if (!key || seenUserKeys.has(key)) return false;
        seenUserKeys.add(key);
        return true;
      });
      allUserList.push(...freshUsers);
      allDeptList.push(...deptList);
      allChatList.push(...chatList);

      hasMore = data?.hasMore ?? false;

      // 无进展防御：SDK 分页失效（page 被忽略）时重复拉取同页，无新增即终止
      if (
        hasMore &&
        freshUsers.length === 0 &&
        deptList.length === 0 &&
        chatList.length === 0
      ) {
        this.logger.warn(
          `listAllMembers(${bizID}) page ${page}: no new members but hasMore=true, stopping`,
        );
        break;
      }
      page++;
    }

    if (hasMore) {
      this.logger.warn(
        `listAllMembers(${bizID}) hit ${MAX_PAGES}-page limit; result may be incomplete`,
      );
    }

    const total = allUserList.length + allDeptList.length + allChatList.length;
    return {
      members: {
        userList: allUserList,
        departmentList: allDeptList,
        groupChatList: allChatList,
        ...meta,
      },
      total,
      hasMore: false,
    };
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

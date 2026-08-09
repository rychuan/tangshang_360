import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, count, sql, isNull, type SQL } from 'drizzle-orm';
import { employee, department } from '@server/database/schema';
import { RoleManagerService } from '../role-manager/role-manager.service';
import { AuthorizationSyncService } from '../role-manager/authorization-sync.service';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { normalizeAuthorizationRoles } from '../role-manager/authorization-state';
import { LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY } from './admin-safety';

export type RoleMutationEntitlement = {
  isAdmin: boolean;
  canEdit: boolean;
};

/**
 * 员工授权守卫域：变更作用域校验、角色变更资格、admin 数量安全、
 * 授权同步触发与角色谓词。与员工数据操作解耦，供 EmployeeManagementService 复用。
 */
@Injectable()
export class EmployeeAuthorizationService {
  private readonly logger = new Logger(EmployeeAuthorizationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
    private readonly authorizationSyncService: AuthorizationSyncService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async assertEmployeeMutationScope(
    userId: string,
    employeeId: string,
  ): Promise<void> {
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      employeeId,
      { includeSelf: true },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权操作该员工');
    }
  }

  async assertGlobalEmployeeScope(userId: string): Promise<void> {
    const scope = await this.accessScopeService.getScope(userId);
    if (scope.kind !== 'global') {
      throw new ForbiddenException('只有全局范围用户可创建员工');
    }
  }

  async assertRoleMutationPermission(
    userId: string,
    identityMessage: string,
    permissionMessage: string,
  ): Promise<void> {
    const entitlement = await this.getRoleMutationEntitlement(userId);
    this.requireRoleMutationEntitlement(
      entitlement,
      identityMessage,
      permissionMessage,
    );
  }

  async getRoleMutationEntitlement(
    userId: string,
  ): Promise<RoleMutationEntitlement> {
    const roles = await this.roleManagerService.getUserRoles(userId);
    if (!roles.includes('admin')) {
      return { isAdmin: false, canEdit: false };
    }
    const canEditPermissions =
      await this.roleManagerService.checkUserPermission(
        userId,
        'permission_management',
        'edit',
      );
    return { isAdmin: true, canEdit: canEditPermissions };
  }

  requireRoleMutationEntitlement(
    entitlement: RoleMutationEntitlement,
    identityMessage: string,
    permissionMessage: string,
  ): void {
    if (!entitlement.isAdmin) {
      throw new ForbiddenException(identityMessage);
    }
    if (!entitlement.canEdit) {
      throw new ForbiddenException(permissionMessage);
    }
  }

  parseRoles(role: string | null | undefined): string[] {
    const roles = String(role || 'employee')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return roles.length > 0 ? roles : ['employee'];
  }

  /**
   * 解析人工角色：剥离 dept_head，并强制保留 employee。
   * - dept_head 是派生角色，唯一入口是部门 head 指派，员工表单/导入中手动携带的
   *   dept_head 一律忽略，由对账统一决定。
   * - employee 是基础角色（自评 my_assessments 等依赖），所有员工必须保留；
   *   避免 API 直接指定 admin/hrd/supervisor（不带 employee）时丢失基础角色
   *   （前端表单 employee 为必选，此兜底主要保护 API/导入路径）。
   */
  parseManualRoles(role: string | null | undefined): string[] {
    const roles = this.parseRoles(role).filter((item) => item !== 'dept_head');
    return roles.includes('employee') ? roles : ['employee', ...roles];
  }

  /**
   * 方案A：部门 head 指派是 dept_head 角色的唯一入口。
   * 传入人工角色（已剥离 dept_head），按当前 head 指派对账补回/剔除 dept_head。
   * 供 create/update/sync/activate/deactivate 等员工生命周期路径统一调用。
   */
  async reconcileDepartmentHeadRole(
    tx: PostgresJsDatabase,
    employeeId: string,
    roles: string[],
  ): Promise<string[]> {
    const isDepartmentHead = await this.hasDepartmentHeadAssignment(
      tx,
      employeeId,
    );
    return normalizeAuthorizationRoles(
      isDepartmentHead
        ? [...roles, 'dept_head']
        : roles.filter((role) => role !== 'dept_head'),
    );
  }

  private async hasDepartmentHeadAssignment(
    tx: PostgresJsDatabase,
    employeeId: string,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: department.id })
      .from(department)
      .where(sql`(${department.headId}).user_id = ${employeeId}`)
      .limit(1);
    return rows.length > 0;
  }

  adminRoleCondition(): SQL {
    return sql`jsonb_exists(COALESCE(${employee.authorizationRoles}, '[]'::jsonb), 'admin')`;
  }

  effectiveAdminCondition(): SQL {
    return and(
      this.adminRoleCondition(),
      eq(employee.status, true),
      eq(employee.authorizationStatus, 'synced'),
      isNull(employee.deletedAt),
    );
  }

  async loadEmployeeForLifecycle(
    tx: PostgresJsDatabase,
    employeeId: string,
  ) {
    const rows = await tx
      .select({
        id: employee.employeeId,
        role: employee.role,
        status: employee.status,
        authorizationRoles: employee.authorizationRoles,
        authorizationStatus: employee.authorizationStatus,
        deletedAt: employee.deletedAt,
      })
      .from(employee)
      .where(eq(employee.employeeId, employeeId))
      .limit(1);
    return rows[0];
  }

  async acquireAdminAdvisoryLock(
    tx: PostgresJsDatabase,
  ): Promise<void> {
    const lockResult = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY}) AS got_lock`,
    );
    const gotLock =
      (lockResult as unknown as Array<{ got_lock?: boolean }>)[0]?.got_lock ===
      true;
    if (!gotLock) {
      throw new ConflictException('操作正在被其他请求处理，请稍后重试');
    }
  }

  async assertAdminCountAfterReduction(
    tx: PostgresJsDatabase,
    message: string,
  ): Promise<void> {
    const adminCountRows = await tx
      .select({ cnt: count() })
      .from(employee)
      .where(this.effectiveAdminCondition());
    if (Number(adminCountRows[0]?.cnt || 0) <= 1) {
      throw new BadRequestException(message);
    }
  }

  getDurableRoles(row: { authorizationRoles?: unknown }): string[] {
    if (!Array.isArray(row.authorizationRoles)) {
      throw new BadRequestException(
        '员工授权角色数据缺失，拒绝恢复 legacy 角色',
      );
    }
    return row.authorizationRoles.filter(
      (role): role is string => typeof role === 'string',
    );
  }

  getDurableRolesForComparison(row: {
    authorizationRoles?: unknown;
  }): string[] {
    return Array.isArray(row.authorizationRoles)
      ? row.authorizationRoles.filter(
          (role): role is string => typeof role === 'string',
        )
      : [];
  }

  isEffectiveAdmin(row: {
    status?: boolean;
    deletedAt?: Date | string | null;
    authorizationStatus?: string;
    authorizationRoles?: unknown;
  }): boolean {
    return (
      row.status === true &&
      row.deletedAt == null &&
      row.authorizationStatus === 'synced' &&
      Array.isArray(row.authorizationRoles) &&
      row.authorizationRoles.includes('admin')
    );
  }

  sameRoles(left: string[], right: string[]): boolean {
    const normalizedLeft = [...new Set(left)].sort();
    const normalizedRight = [...new Set(right)].sort();
    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((role, index) => role === normalizedRight[index])
    );
  }

  async processAuthorization(
    employeeId: string,
    version: number,
  ): Promise<void> {
    const result =
      await this.authorizationSyncService.processEmployeeAuthorization(
        employeeId,
        version,
      );
    // superseded：该版本已被更新的版本覆盖（并发变更），最终状态由新版本负责，不视为失败；
    // stale_owner：任务正被其他 worker 处理，最终状态由对方负责，不视为失败。
    // 仅 failed / not_processable 需要抛错。
    if (
      result.status !== 'synced' &&
      result.status !== 'superseded' &&
      result.status !== 'stale_owner'
    ) {
      throw new Error(
        result.error ||
          `Employee ${employeeId} authorization sync finished with ${result.status}`,
      );
    }
  }
}

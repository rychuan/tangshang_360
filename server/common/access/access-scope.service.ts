import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { department, employee } from '@server/database/schema';
import { RoleManagerService } from '@server/modules/role-manager/role-manager.service';

export type AccessScopeKind = 'global' | 'managed' | 'self';

export type AccessScope = {
  kind: AccessScopeKind;
  roles: string[];
  departmentIds: string[];
  subordinateIds: string[];
};

export function classifyAccessScope(
  roles: string[],
  hasDepartmentScope: boolean,
  hasSubordinates: boolean,
): AccessScopeKind {
  if (roles.includes('admin') || roles.includes('hrd')) {
    return 'global';
  }
  if (
    roles.includes('dept_head') ||
    roles.includes('supervisor') ||
    hasDepartmentScope ||
    hasSubordinates
  ) {
    return 'managed';
  }
  return 'self';
}

@Injectable()
export class AccessScopeService {
  private readonly logger = new Logger(AccessScopeService.name);
  // 角色漂移告警节流：同一用户同一角色 10 分钟内最多告警一次，避免每次请求刷日志
  private readonly scopeDriftWarnedAt = new Map<string, number>();
  private readonly SCOPE_DRIFT_WARN_TTL_MS = 10 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  private logScopeDrift(userId: string, role: 'dept_head' | 'supervisor'): void {
    const key = `${userId}:${role}`;
    const now = Date.now();
    if ((this.scopeDriftWarnedAt.get(key) ?? 0) > now - this.SCOPE_DRIFT_WARN_TTL_MS) {
      return;
    }
    this.scopeDriftWarnedAt.set(key, now);
    this.logger.warn(
      `User ${userId} has ${role} role but no matching scope data` +
        `（${role === 'dept_head' ? '无负责部门' : '无直接下属'}）— 数据范围将为空`,
    );
  }

  async getScope(userId: string): Promise<AccessScope> {
    const roles = await this.roleManagerService.getUserRoles(userId);

    if (roles.includes('admin') || roles.includes('hrd')) {
      return {
        kind: 'global',
        roles,
        departmentIds: [],
        subordinateIds: [],
      };
    }

    // Verify employee exists and is active (no longer requires synced authorization)
    const callerRows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${userId}`,
          eq(employee.status, true),
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    if (callerRows.length === 0) {
      return {
        kind: 'self',
        roles: [],
        departmentIds: [],
        subordinateIds: [],
      };
    }

    const isDeptHead = roles.includes('dept_head');
    const isSupervisor = roles.includes('supervisor');

    // 部门范围：仅当用户有 dept_head 角色时才查询其负责的部门
    const departmentPromise = isDeptHead
      ? this.db
          .select({ id: department.id })
          .from(department)
          .where(
            and(
              sql`(${department.headId}).user_id = ${userId}`,
              eq(department.isActive, true),
            ),
          )
      : Promise.resolve([] as { id: string }[]);

    // 下属范围：仅当用户有 supervisor 角色时才查询其直接下属
    const subordinatePromise = isSupervisor
      ? this.db
          .select({ userId: sql<string>`(${employee.employeeId}).user_id` })
          .from(employee)
          .where(
            and(
              sql`(${employee.supervisorId}).user_id = ${userId}`,
              isNull(employee.deletedAt),
              eq(employee.status, true),
            ),
          )
      : Promise.resolve([] as { userId: string }[]);

    const [departmentRows, subordinateRows] = await Promise.all([
      departmentPromise,
      subordinatePromise,
    ]);

    // 角色存在但无对应数据（角色残留/未分配/同步失败）→ 告警便于排查静默空范围
    if (isDeptHead && departmentRows.length === 0) {
      this.logScopeDrift(userId, 'dept_head');
    }
    if (isSupervisor && subordinateRows.length === 0) {
      this.logScopeDrift(userId, 'supervisor');
    }

    const departmentIds = departmentRows.map((row) => row.id);
    const subordinateIds = subordinateRows.map((row) => row.userId);

    return {
      kind: classifyAccessScope(
        roles,
        isDeptHead && departmentIds.length > 0,
        isSupervisor && subordinateIds.length > 0,
      ),
      roles,
      departmentIds,
      subordinateIds,
    };
  }

  async buildEmployeeScopeCondition(
    userId: string,
    options: { includeSelf?: boolean } = {},
    scope?: AccessScope,
  ): Promise<SQL | null> {
    const s = scope ?? (await this.getScope(userId));
    if (s.kind === 'global') {
      return null;
    }

    const selfCondition = sql`(${employee.employeeId}).user_id = ${userId}`;
    if (s.kind === 'self') {
      return options.includeSelf ? selfCondition : sql`FALSE`;
    }

    // 直接下属谓词仅在用户具备 supervisor 范围（有实际下属）时生效；
    // dept_head 仅按部门成员判定，避免跨部门直接汇报人越界进入范围。
    // 与 canAccessEmployees 的 subordinateSet 语义保持一致。
    const supervisorCondition =
      s.subordinateIds.length > 0
        ? sql`(${employee.supervisorId}).user_id = ${userId}`
        : sql`FALSE`;
    const departmentCondition =
      s.departmentIds.length > 0
        ? sql`${employee.departmentId} IN (${sql.join(
            s.departmentIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`FALSE`;

    if (options.includeSelf) {
      return sql`(${selfCondition} OR ${supervisorCondition} OR ${departmentCondition})`;
    }
    return sql`(${supervisorCondition} OR ${departmentCondition})`;
  }

  async getManagedEmployeeIds(
    userId: string,
    options: { includeSelf?: boolean } = {},
  ): Promise<string[]> {
    const scope = await this.getScope(userId);
    // managed 范围但无实际部门/下属数据（dept_head 尚未分配部门、supervisor 无下属等）：
    // 直接空返回，避免执行 WHERE (FALSE OR FALSE) 的无意义查询
    if (
      scope.kind === 'managed' &&
      scope.departmentIds.length === 0 &&
      scope.subordinateIds.length === 0
    ) {
      return [];
    }

    const condition = await this.buildEmployeeScopeCondition(userId, options, scope);
    if (condition === null) {
      const conditions = [
        isNull(employee.deletedAt),
        eq(employee.status, true),
      ];
      if (!options.includeSelf) {
        conditions.push(sql`(${employee.employeeId}).user_id != ${userId}`);
      }
      const rows = await this.db
        .select({ userId: sql<string>`(${employee.employeeId}).user_id` })
        .from(employee)
        .where(and(...conditions));
      return rows.map((row) => row.userId);
    }

    const conditions = [
      condition,
      isNull(employee.deletedAt),
      eq(employee.status, true),
    ];
    if (!options.includeSelf) {
      conditions.push(sql`(${employee.employeeId}).user_id != ${userId}`);
    }

    const rows = await this.db
      .select({ userId: sql<string>`(${employee.employeeId}).user_id` })
      .from(employee)
      .where(and(...conditions));
    return rows.map((row) => row.userId);
  }

  async canAccessEmployee(
    userId: string,
    employeeId: string,
    options: { includeSelf?: boolean } = { includeSelf: true },
  ): Promise<boolean> {
    const map = await this.canAccessEmployees(userId, [employeeId], options);
    return map.get(employeeId) ?? false;
  }

  /**
   * 批量数据范围判定：一次 getScope + 一次员工查询完成全部判定，
   * 避免逐员工调用 canAccessEmployee 时重复 getScope（N+1）。
   * 语义与 canAccessEmployee 完全一致。
   */
  async canAccessEmployees(
    userId: string,
    employeeIds: string[],
    options: { includeSelf?: boolean } = { includeSelf: true },
  ): Promise<Map<string, boolean>> {
    const scope = await this.getScope(userId);
    const uniqueIds = [...new Set(employeeIds)];
    const result = new Map<string, boolean>();

    if (scope.kind === 'global') {
      for (const id of uniqueIds) {
        result.set(id, true);
      }
      return result;
    }

    const rows =
      uniqueIds.length > 0
        ? await this.db
            .select({
              departmentId: employee.departmentId,
              userId: sql<string>`(${employee.employeeId}).user_id`,
            })
            .from(employee)
            .where(
              and(
                inArray(sql`(${employee.employeeId}).user_id`, uniqueIds),
                isNull(employee.deletedAt),
                eq(employee.status, true),
              ),
            )
        : [];
    const employeeDeptMap = new Map(
      rows.map((row) => [row.userId, row.departmentId]),
    );
    const subordinateSet = new Set(scope.subordinateIds);
    const departmentSet = new Set(scope.departmentIds);

    for (const id of uniqueIds) {
      const deptId = employeeDeptMap.get(id);
      // 员工不存在/停用/删除 → 无权
      if (deptId === undefined) {
        result.set(id, false);
        continue;
      }
      if (id === userId) {
        result.set(id, Boolean(options.includeSelf));
        continue;
      }
      if (subordinateSet.has(id)) {
        result.set(id, true);
        continue;
      }
      if (departmentSet.size === 0) {
        result.set(id, false);
        continue;
      }
      result.set(id, deptId != null && departmentSet.has(deptId));
    }
    return result;
  }
}

import { Inject, Injectable } from '@nestjs/common';
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
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  async getScope(userId: string): Promise<AccessScope> {
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

    const roles = await this.roleManagerService.getUserRoles(userId);
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
  ): Promise<SQL | null> {
    const scope = await this.getScope(userId);
    if (scope.kind === 'global') {
      return null;
    }

    const selfCondition = sql`(${employee.employeeId}).user_id = ${userId}`;
    if (scope.kind === 'self') {
      return options.includeSelf ? selfCondition : sql`FALSE`;
    }

    const supervisorCondition = sql`(${employee.supervisorId}).user_id = ${userId}`;
    const departmentCondition =
      scope.departmentIds.length > 0
        ? sql`${employee.departmentId} IN (${sql.join(
            scope.departmentIds.map((id) => sql`${id}`),
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
    const condition = await this.buildEmployeeScopeCondition(userId, options);
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

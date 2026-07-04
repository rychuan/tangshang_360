import { Injectable, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, isNull, count, and } from 'drizzle-orm';
import { sql, type SQL, type Column } from 'drizzle-orm';
import { employee } from '@server/database/schema';

/**
 * 员工数据访问层 — 封装 employee 表的通用查询，消除跨模块重复。
 * 自动处理 userProfile 复合类型语法和软删除过滤。
 */
@Injectable()
export class EmployeeRepository {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * 按用户 ID 查找员工（自动过滤软删除）。
   */
  async findById(userId: string) {
    const rows = await this.db
      .select()
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${userId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * 按用户 ID 批量查找员工（自动过滤软删除）。
   */
  async findByIds(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .select()
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          isNull(employee.deletedAt),
        ),
      );
  }

  /**
   * 检查员工是否存在且未被软删除。
   */
  async exists(userId: string): Promise<boolean> {
    const row = await this.findById(userId);
    return row !== null;
  }

  /**
   * 查找指定主管的所有活跃下属员工 ID。
   */
  async findSubordinateIds(supervisorId: string): Promise<string[]> {
    const rows = await this.db
      .select({
        userId: sql<string>`(${employee.employeeId}).user_id`,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.supervisorId}).user_id = ${supervisorId}`,
          isNull(employee.deletedAt),
          eq(employee.status, true),
        ),
      );
    return rows.map((r) => r.userId);
  }

  /**
   * 按部门统计活跃员工数量。
   */
  async getDepartmentMemberCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        dept: employee.department,
        cnt: count(),
      })
      .from(employee)
      .where(isNull(employee.deletedAt))
      .groupBy(employee.department);
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.dept, Number(r.cnt));
    }
    return map;
  }

  // ---- SQL 构建器 ----

  /**
   * 生成员工名称解析子查询。
   * 消除 8+ 处重复的 `(SELECT name FROM employee sup WHERE (sup.employee_id).user_id = ...)` 模式。
   */
  nameSubquery(refColumn: Column | SQL): SQL {
    return sql<string>`(SELECT e.name FROM ${employee} e
      WHERE ${refColumn} IS NOT NULL
        AND (e.employee_id).user_id = (${refColumn}).user_id
        AND e.deleted_at IS NULL
      LIMIT 1)`;
  }

  /**
   * 生成 userProfile 复合类型的 JOIN 条件。
   * 消除散布各处的 `(${left}).user_id = (${right}).user_id` 模式。
   */
  joinOnUserId(leftCol: Column | SQL, rightCol: Column | SQL): SQL {
    return sql`(${leftCol}).user_id = (${rightCol}).user_id AND ${rightCol} IS NOT NULL`;
  }
}

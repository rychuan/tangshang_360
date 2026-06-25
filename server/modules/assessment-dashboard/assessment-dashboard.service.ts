import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { assessmentInstance, employee } from '@server/database/schema';
import { RoleManagerService } from '../role-manager/role-manager.service';
import { eq, and, or, desc, count, avg, sql, isNull } from 'drizzle-orm';
import type {
  DashboardTodosResponse,
  DashboardOverviewResponse,
} from '@shared/api.interface';

@Injectable()
export class AssessmentDashboardService {
  private readonly logger = new Logger(AssessmentDashboardService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  async todos(userId: string): Promise<DashboardTodosResponse> {
    const instances = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        status: assessmentInstance.status,
        employeeId: assessmentInstance.employeeId,
        supervisorId: assessmentInstance.supervisorId,
      })
      .from(assessmentInstance)
      .where(
        or(
          and(
            sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
            eq(assessmentInstance.status, 'self_review'),
          ),
          and(
            sql`(${assessmentInstance.supervisorId}).user_id = ${userId}`,
            eq(assessmentInstance.status, 'supervisor_review'),
          ),
          and(
            or(
              sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
              sql`(${assessmentInstance.supervisorId}).user_id = ${userId}`,
            ),
            eq(assessmentInstance.status, 'pending_sign'),
          ),
        ),
      )
      .orderBy(desc(assessmentInstance.createdAt));

    const items: DashboardTodosResponse['items'] = [];
    for (const inst of instances) {
      const isEmployee =
        inst.employeeId === userId && inst.status === 'self_review';
      const isSupervisor =
        inst.supervisorId === userId && inst.status === 'supervisor_review';
      const isPendingSign = inst.status === 'pending_sign';

      let type: 'self_review' | 'supervisor_review' | 'sign';
      if (isEmployee) {
        type = 'self_review';
      } else if (isSupervisor) {
        type = 'supervisor_review';
      } else if (isPendingSign) {
        type = 'sign';
      } else {
        continue;
      }

      items.push({
        id: inst.id,
        period: inst.period,
        type,
        title: getTodoTitle(type, inst.period),
      });
    }

    return { items };
  }

  async overview(userId: string): Promise<DashboardOverviewResponse> {
    // 4.1: 修正 HRD 判定 — 检查是否有下属 + position 是否为管理岗
    const { role, hasSubordinates } = await this.getUserRole(userId);

    // 4.2: 根据角色返回不同的概览范围
    let pendingWhere;
    let completedWhere;

    if (role === 'hrd') {
      // HRD: 全公司数据
      pendingWhere = or(
        eq(assessmentInstance.status, 'self_review'),
        eq(assessmentInstance.status, 'supervisor_review'),
        eq(assessmentInstance.status, 'pending_sign'),
      );
      completedWhere = eq(assessmentInstance.status, 'completed');
    } else if (role === 'supervisor' || hasSubordinates) {
      // 上级：下属数据
      const subIds = await this.getSubordinateIds(userId);
      if (subIds.length === 0) {
        // 没有下属也 fallback 到个人数据
        const personalPending = this.buildPersonalPendingWhere(userId);
        const personalCompleted = this.buildPersonalCompletedWhere(userId);
        return this.queryOverview(userId, personalPending, personalCompleted);
      }
      const empInCond = buildEmployeeIdInCondition(assessmentInstance.employeeId, subIds);
      pendingWhere = and(
        empInCond,
        or(
          eq(assessmentInstance.status, 'self_review'),
          eq(assessmentInstance.status, 'supervisor_review'),
          eq(assessmentInstance.status, 'pending_sign'),
        ),
      );
      completedWhere = and(
        empInCond,
        eq(assessmentInstance.status, 'completed'),
      );
    } else {
      // 普通员工：个人数据
      const personalPending = this.buildPersonalPendingWhere(userId);
      const personalCompleted = this.buildPersonalCompletedWhere(userId);
      return this.queryOverview(userId, personalPending, personalCompleted);
    }

    const pendingResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(pendingWhere);
    const pendingCount = Number(pendingResult[0].cnt);

    const completedResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(completedWhere);
    const completedCount = Number(completedResult[0].cnt);

    const avgResult = await this.db
      .select({ avgVal: avg(assessmentInstance.totalScore) })
      .from(assessmentInstance)
      .where(completedWhere);
    const avgScore = avgResult[0].avgVal
      ? Math.round(Number(avgResult[0].avgVal) * 100) / 100
      : undefined;

    const gradeRows = await this.db
      .select({
        grade: assessmentInstance.grade,
        cnt: count(),
      })
      .from(assessmentInstance)
      .where(completedWhere)
      .groupBy(assessmentInstance.grade);
    const gradeDistribution: Record<string, number> = {};
    for (const row of gradeRows) {
      if (row.grade) {
        gradeDistribution[row.grade] = Number(row.cnt);
      }
    }

    const trendRows = await this.db
      .select({
        period: assessmentInstance.period,
        avgVal: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .where(completedWhere)
      .groupBy(assessmentInstance.period)
      .orderBy(desc(assessmentInstance.period))
      .limit(6);
    const trend = trendRows
      .reverse()
      .map((row) => ({
        month: row.period,
        score: row.avgVal ? Math.round(Number(row.avgVal) * 100) / 100 : 0,
      }));

    const shortcuts = await this.buildShortcuts(userId, role);

    return {
      stats: {
        pendingCount,
        completedCount,
        avgScore,
        gradeDistribution:
          Object.keys(gradeDistribution).length > 0
            ? gradeDistribution
            : undefined,
        trend: trend.length > 0 ? trend : undefined,
      },
      shortcuts,
    };
  }

  private buildPersonalPendingWhere(userId: string) {
    return or(
      and(
        sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
        eq(assessmentInstance.status, 'self_review'),
      ),
      and(
        sql`(${assessmentInstance.supervisorId}).user_id = ${userId}`,
        eq(assessmentInstance.status, 'supervisor_review'),
      ),
      and(
        or(
          sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
          sql`(${assessmentInstance.supervisorId}).user_id = ${userId}`,
        ),
        eq(assessmentInstance.status, 'pending_sign'),
      ),
    );
  }

  private buildPersonalCompletedWhere(userId: string) {
    return and(
      sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
      eq(assessmentInstance.status, 'completed'),
    );
  }

  private async queryOverview(
    userId: string,
    pendingWhere: any,
    completedWhere: any,
  ): Promise<DashboardOverviewResponse> {
    const pendingResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(pendingWhere);
    const pendingCount = Number(pendingResult[0].cnt);

    const completedResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(completedWhere);
    const completedCount = Number(completedResult[0].cnt);

    const avgResult = await this.db
      .select({ avgVal: avg(assessmentInstance.totalScore) })
      .from(assessmentInstance)
      .where(completedWhere);
    const avgScore = avgResult[0].avgVal
      ? Math.round(Number(avgResult[0].avgVal) * 100) / 100
      : undefined;

    const gradeRows = await this.db
      .select({
        grade: assessmentInstance.grade,
        cnt: count(),
      })
      .from(assessmentInstance)
      .where(completedWhere)
      .groupBy(assessmentInstance.grade);
    const gradeDistribution: Record<string, number> = {};
    for (const row of gradeRows) {
      if (row.grade) {
        gradeDistribution[row.grade] = Number(row.cnt);
      }
    }

    const trendRows = await this.db
      .select({
        period: assessmentInstance.period,
        avgVal: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .where(completedWhere)
      .groupBy(assessmentInstance.period)
      .orderBy(desc(assessmentInstance.period))
      .limit(6);
    const trend = trendRows
      .reverse()
      .map((row) => ({
        month: row.period,
        score: row.avgVal ? Math.round(Number(row.avgVal) * 100) / 100 : 0,
      }));

    const shortcuts = await this.buildShortcuts(userId, 'employee');

    return {
      stats: {
        pendingCount,
        completedCount,
        avgScore,
        gradeDistribution:
          Object.keys(gradeDistribution).length > 0
            ? gradeDistribution
            : undefined,
        trend: trend.length > 0 ? trend : undefined,
      },
      shortcuts,
    };
  }

  private async getUserRole(userId: string): Promise<{ role: 'employee' | 'supervisor' | 'hrd'; hasSubordinates: boolean }> {
    // 查是否有其他人以其为上级
    const subResult = await this.db
      .select({ cnt: count() })
      .from(employee)
      .where(and(sql`(${employee.supervisorId}).user_id = ${userId}`, isNull(employee.deletedAt)));
    const hasSubordinates = Number(subResult[0].cnt) > 0;

    try {
      const roles = await this.roleManagerService.getUserRoles(userId);
      if (roles.includes('admin') || roles.includes('hrd') || roles.includes('dept_head')) {
        return { role: 'hrd', hasSubordinates };
      }
      if (roles.includes('supervisor') || hasSubordinates) {
        return { role: 'supervisor', hasSubordinates };
      }
    } catch (err) {
      this.logger.warn(`Failed to get roles from AuthorizationSDK for ${userId}`);
    }

    if (hasSubordinates) return { role: 'supervisor', hasSubordinates: true };
    return { role: 'employee', hasSubordinates: false };
  }

  private async getSubordinateIds(userId: string): Promise<string[]> {
    const subRows = await this.db
      .select({ userId: sql<string>`(${employee.id}).user_id` })
      .from(employee)
      .where(and(sql`(${employee.supervisorId}).user_id = ${userId}`, isNull(employee.deletedAt)));
    return subRows.map((r: { userId: string }) => r.userId);
  }

  private async buildShortcuts(
    userId: string,
    role: string,
  ): Promise<DashboardOverviewResponse['shortcuts']> {
    if (role === 'hrd') {
      return [
        { title: '员工管理', path: '/employees' },
        { title: '权限管理', path: '/permissions' },
        { title: '考核模板管理', path: '/template-management' },
        { title: '考核发布管理', path: '/publish-management' },
        { title: '考核统计查询', path: '/statistics' },
      ];
    }

    if (role === 'supervisor') {
      return [
        { title: '上级评分待办', path: '/' },
        { title: '考核统计查询', path: '/statistics' },
      ];
    }

    return [
      { title: '我的考核', path: '/my-assessments' },
      { title: '我的自评', path: '/' },
    ];
  }
}

function getTodoTitle(
  type: 'self_review' | 'supervisor_review' | 'sign',
  period: string,
): string {
  switch (type) {
    case 'self_review':
      return `${period} 自评待完成`;
    case 'supervisor_review':
      return `${period} 上级评分待完成`;
    case 'sign':
      return `${period} 签名确认待完成`;
  }
}

function buildEmployeeIdInCondition(
  col: typeof assessmentInstance.employeeId,
  ids: string[],
) {
  if (ids.length === 0) return sql`FALSE`;
  const chunks = ids.map((id) => sql`(${col}).user_id = ${id}`);
  return sql.join(chunks, sql` OR `);
}

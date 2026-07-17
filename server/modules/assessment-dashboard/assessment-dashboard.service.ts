import { Injectable, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { assessmentInstance } from '@server/database/schema';
import { EmployeeRepository } from '../employee-management/employee.repository';
import { eq, and, or, desc, count, avg, sql } from 'drizzle-orm';
import {
  AccessScopeService,
  type AccessScope,
} from '@server/common/access/access-scope.service';
import type {
  DashboardTodosResponse,
  DashboardOverviewResponse,
} from '@shared/api.interface';

@Injectable()
export class AssessmentDashboardService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly employeeRepo: EmployeeRepository,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async todos(userId: string): Promise<DashboardTodosResponse> {
    const subIds = await this.employeeRepo.findSubordinateIds(userId);

    const employeeCond = sql`(${assessmentInstance.employeeId}).user_id = ${userId}`;
    const supervisorCond =
      subIds.length > 0
        ? buildEmployeeIdInCondition(assessmentInstance.employeeId, subIds)
        : sql`FALSE`;

    const instances = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        status: assessmentInstance.status,
      })
      .from(assessmentInstance)
      .where(
        or(
          and(employeeCond, eq(assessmentInstance.status, 'self_review')),
          and(
            supervisorCond,
            eq(assessmentInstance.status, 'supervisor_review'),
          ),
          and(employeeCond, eq(assessmentInstance.status, 'pending_sign')),
          and(supervisorCond, eq(assessmentInstance.status, 'supervisor_sign')),
        ),
      )
      .orderBy(desc(assessmentInstance.createdAt));

    const items: DashboardTodosResponse['items'] = [];
    for (const inst of instances) {
      let type: DashboardTodosResponse['items'][number]['type'];
      if (inst.status === 'self_review' || inst.status === 'pending_sign') {
        type = 'self_review';
      } else if (
        inst.status === 'supervisor_review' ||
        inst.status === 'supervisor_sign'
      ) {
        type = 'supervisor_review';
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
    const scope = await this.accessScopeService.getScope(userId);
    const managedEmployeeIds =
      scope.kind === 'managed'
        ? await this.accessScopeService.getManagedEmployeeIds(userId, {
            includeSelf: true,
          })
        : [];
    const employeeIds = dashboardEmployeeIds(scope, userId, managedEmployeeIds);
    const employeeWhere =
      employeeIds === null
        ? undefined
        : buildEmployeeIdInCondition(
            assessmentInstance.employeeId,
            employeeIds,
          );
    const pendingStatusWhere = or(
      eq(assessmentInstance.status, 'self_review'),
      eq(assessmentInstance.status, 'supervisor_review'),
      eq(assessmentInstance.status, 'pending_sign'),
      eq(assessmentInstance.status, 'supervisor_sign'),
    );
    const pendingWhere = employeeWhere
      ? and(employeeWhere, pendingStatusWhere)
      : pendingStatusWhere;
    const completedStatusWhere = eq(assessmentInstance.status, 'completed');
    const completedWhere = employeeWhere
      ? and(employeeWhere, completedStatusWhere)
      : completedStatusWhere;
    const shortcutRole =
      scope.kind === 'global'
        ? 'hrd'
        : scope.kind === 'managed'
          ? 'supervisor'
          : 'employee';

    return this.queryOverview(
      userId,
      pendingWhere,
      completedWhere,
      shortcutRole,
    );
  }

  private async queryOverview(
    userId: string,
    pendingWhere: any,
    completedWhere: any,
    shortcutRole: string,
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
    const trend = trendRows.reverse().map((row) => ({
      month: row.period,
      score: row.avgVal ? Math.round(Number(row.avgVal) * 100) / 100 : 0,
    }));

    const shortcuts = await this.buildShortcuts(userId, shortcutRole);

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

export function dashboardEmployeeIds(
  scope: AccessScope,
  userId: string,
  managedEmployeeIds: string[],
): string[] | null {
  if (scope.kind === 'global') return null;
  if (scope.kind === 'self') return [userId];
  return Array.from(new Set(managedEmployeeIds));
}

function getTodoTitle(
  type: DashboardTodosResponse['items'][number]['type'],
  period: string,
): string {
  switch (type) {
    case 'self_review':
      return `${period} 员工评分待完成`;
    case 'supervisor_review':
      return `${period} 上级评分待完成`;
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

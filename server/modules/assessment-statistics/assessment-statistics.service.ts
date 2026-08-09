import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { assessmentInstance, employee, department } from '@server/database/schema';
import { and, or, desc, count, avg, sql, isNull, inArray, eq } from 'drizzle-orm';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import type {
  StatisticsRecordsResponse,
  StatisticsRecordItem,
  ChartsResponse,
  ExportResult,
} from '@shared/api.interface';

export interface RecordsQuery {
  page: number;
  pageSize: number;
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
  employeeIds?: string[];
}

export interface ChartsQuery {
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
}

export interface ExportQuery {
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
  employeeIds?: string[];
}

@Injectable()
export class AssessmentStatisticsService {
  private readonly logger = new Logger(AssessmentStatisticsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async records(
    query: RecordsQuery,
    userId: string,
  ): Promise<StatisticsRecordsResponse> {
    const conditions = await this.buildConditions(query, userId);

    const countResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(and(...conditions));
    const total = Number(countResult[0].cnt);

    const offset = (query.page - 1) * query.pageSize;
    // Use LEFT JOIN for supervisor to avoid N correlated subqueries
    const supAlias = sql`sup`;
    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        position: assessmentInstance.position,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        status: assessmentInstance.status,
        completedAt: assessmentInstance.completedAt,
        employeeName: employee.name,
        // 部门名称由 department_id 关联 department 表联查得到
        department: department.name,
        supervisorName: sql<string>`COALESCE(${supAlias}.name, '')`,
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id AND ${employee.deletedAt} IS NULL`,
      )
      .leftJoin(department, eq(employee.departmentId, department.id))
      .leftJoin(
        sql`employee ${supAlias}`,
        sql`(${supAlias}.employee_id).user_id = (${assessmentInstance.supervisorId}).user_id AND ${supAlias}.deleted_at IS NULL`,
      )
      .where(and(...conditions))
      .orderBy(desc(assessmentInstance.createdAt))
      .limit(query.pageSize)
      .offset(offset);

    const items: StatisticsRecordItem[] = rows.map((row) => ({
      id: row.id,
      period: row.period,
      employeeName: row.employeeName || '',
      department: row.department || '',
      position: row.position,
      supervisorName: row.supervisorName || '',
      totalScore: row.totalScore ? Number(row.totalScore) : 0,
      grade: row.grade || '',
      status: row.status,
      completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
    }));

    return { items, total };
  }

  async charts(query: ChartsQuery, userId: string): Promise<ChartsResponse> {
    // 5.3: 对齐筛选参数 — charts 也支持 position 和 grade
    const baseConditions: ReturnType<typeof and>[] =
      await this.buildConditions(query, userId);

    const baseWhere =
      baseConditions.length > 0 ? and(...baseConditions) : undefined;

    // 5.4: 等级分布 — 过滤 grade IS NOT NULL
    const gradeConditions = [...baseConditions];
    gradeConditions.push(sql`${assessmentInstance.grade} IS NOT NULL`);

    const gradeRows = await this.db
      .select({
        grade: assessmentInstance.grade,
        cnt: count(),
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(gradeConditions.length > 0 ? and(...gradeConditions) : undefined)
      .groupBy(assessmentInstance.grade);

    const gradeDistribution: ChartsResponse['gradeDistribution'] = gradeRows
      .filter((r) => r.grade !== null)
      .map((r) => ({ grade: r.grade!, count: Number(r.cnt) }));

    // 部门平均分
    const deptRows = await this.db
      .select({
        // 部门名称由 department_id 关联 department 表联查得到
        department: department.name,
        avgVal: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .leftJoin(department, eq(employee.departmentId, department.id))
      .where(and(baseWhere || sql`TRUE`, isNull(employee.deletedAt)))
      .groupBy(employee.departmentId);

    const departmentAvg: ChartsResponse['departmentAvg'] = deptRows.map(
      (r) => ({
        department: r.department,
        avgScore: r.avgVal ? Math.round(Number(r.avgVal) * 100) / 100 : 0,
      }),
    );

    // 趋势
    const trendRows = await this.db
      .select({
        period: assessmentInstance.period,
        avgVal: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(baseWhere)
      .groupBy(assessmentInstance.period)
      .orderBy(assessmentInstance.period)
      .limit(12);

    const trend: ChartsResponse['trend'] = trendRows.map((r) => ({
      month: r.period,
      avgScore: r.avgVal ? Math.round(Number(r.avgVal) * 100) / 100 : 0,
    }));

    // 5.4: 增加岗位平均分统计
    const positionRows = await this.db
      .select({
        position: assessmentInstance.position,
        avgVal: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(baseWhere)
      .groupBy(assessmentInstance.position);

    const positionAvg: ChartsResponse['positionAvg'] = positionRows.map(
      (r) => ({
        position: r.position,
        avgScore: r.avgVal ? Math.round(Number(r.avgVal) * 100) / 100 : 0,
      }),
    );

    return { gradeDistribution, departmentAvg, trend, positionAvg };
  }

  async exportData(query: ExportQuery, userId: string): Promise<ExportResult> {
    const conditions = await this.buildConditions(query, userId);

    // 先查询总数
    const countResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(and(...conditions));
    const total = Number(countResult[0].cnt);

    const supAlias = sql`sup`;
    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        position: assessmentInstance.position,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        status: assessmentInstance.status,
        completedAt: assessmentInstance.completedAt,
        employeeName: employee.name,
        // 部门名称由 department_id 关联 department 表联查得到
        department: department.name,
        supervisorName: sql<string>`COALESCE(${supAlias}.name, '')`,
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.employeeId}).user_id`,
      )
      .leftJoin(department, eq(employee.departmentId, department.id))
      .leftJoin(
        sql`employee ${supAlias}`,
        sql`(${supAlias}.employee_id).user_id = (${assessmentInstance.supervisorId}).user_id AND ${supAlias}.deleted_at IS NULL`,
      )
      .where(and(...conditions))
      .orderBy(desc(assessmentInstance.createdAt))
      .limit(500);

    const items: StatisticsRecordItem[] = rows.map((row) => ({
      id: row.id,
      period: row.period,
      employeeName: row.employeeName || '',
      department: row.department || '',
      position: row.position,
      supervisorName: row.supervisorName || '',
      totalScore: row.totalScore ? Number(row.totalScore) : 0,
      grade: row.grade || '',
      status: row.status,
      completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
    }));

    return {
      items,
      total,
      exportedCount: items.length,
      isTruncated: items.length < total,
    };
  }

  private async buildConditions(
    query: RecordsQuery | ExportQuery | ChartsQuery,
    userId: string,
  ): Promise<ReturnType<typeof and>[]> {
    const conditions: ReturnType<typeof and>[] = [isNull(employee.deletedAt)];
    const scopeCondition =
      await this.accessScopeService.buildEmployeeScopeCondition(userId, {
        includeSelf: true,
      });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }
    if (query.periods && query.periods.length > 0) {
      conditions.push(inArray(assessmentInstance.period, query.periods));
    }
    if (query.departments && query.departments.length > 0) {
      // 名称列已废弃：名称数组解析为 department_id 后精确匹配
      const deptRows = await this.db
        .select({ id: department.id })
        .from(department)
        .where(inArray(department.name, query.departments));
      if (deptRows.length > 0) {
        conditions.push(
          inArray(employee.departmentId, deptRows.map((d) => d.id)),
        );
      } else {
        conditions.push(sql`FALSE`);
      }
    }
    if (query.positions && query.positions.length > 0) {
      conditions.push(
        or(
          inArray(employee.position, query.positions),
          inArray(assessmentInstance.position, query.positions),
        ),
      );
    }
    if (query.grades && query.grades.length > 0) {
      conditions.push(inArray(assessmentInstance.grade, query.grades));
    }
    if ('employeeIds' in query && query.employeeIds && query.employeeIds.length > 0) {
      const idChunks = query.employeeIds.map((id: string) => sql`${id}`);
      conditions.push(
        sql`(${assessmentInstance.employeeId}).user_id IN (${sql.join(idChunks, sql`, `)})`,
      );
    }
    return conditions;
  }
}

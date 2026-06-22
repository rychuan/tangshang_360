import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { assessmentInstance } from '@server/database/schema';
import { and, desc, count, avg, sql, eq } from 'drizzle-orm';
import type {
  MyAssessmentRecordsResponse,
  MyAssessmentTrendResponse,
  MyAssessmentSummary,
} from '@shared/api.interface';

@Injectable()
export class MyAssessmentService {
  private readonly logger = new Logger(MyAssessmentService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getAvailableYears(userId: string): Promise<string[]> {
    const employeeFilter = sql`(${assessmentInstance.employeeId}).user_id = ${userId}`;
    const rows = await this.db
      .select({
        year: sql<string>`SUBSTRING(${assessmentInstance.period} FROM 1 FOR 4)`,
      })
      .from(assessmentInstance)
      .where(employeeFilter)
      .groupBy(
        sql`SUBSTRING(${assessmentInstance.period} FROM 1 FOR 4)`,
      )
      .orderBy(
        sql`SUBSTRING(${assessmentInstance.period} FROM 1 FOR 4) DESC`,
      );
    const years = rows.map((r) => r.year);
    const currentYear = String(new Date().getFullYear());
    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }
    return years;
  }

  async records(
    userId: string,
    page: number,
    pageSize: number,
    status?: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<MyAssessmentRecordsResponse> {
    const employeeFilter = sql`(${assessmentInstance.employeeId}).user_id = ${userId}`;

    // 5.1: 增加状态/月份范围过滤
    const conditions: ReturnType<typeof and>[] = [employeeFilter];
    if (status) {
      conditions.push(eq(assessmentInstance.status, status));
    }
    if (periodStart) {
      conditions.push(sql`${assessmentInstance.period} >= ${periodStart}`);
    }
    if (periodEnd) {
      conditions.push(sql`${assessmentInstance.period} <= ${periodEnd}`);
    }

    const whereClause = and(...conditions);

    const totalResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(whereClause);
    const total = Number(totalResult[0].cnt);

    const offset = (page - 1) * pageSize;
    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        position: assessmentInstance.position,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        status: assessmentInstance.status,
        selfSignAt: assessmentInstance.selfSignAt,
        supervisorSignAt: assessmentInstance.supervisorSignAt,
        completedAt: assessmentInstance.completedAt,
        createdAt: assessmentInstance.createdAt,
      })
      .from(assessmentInstance)
      .where(whereClause)
      // 5.1: 未完成置顶 (status != 'completed' 排前面)
      .orderBy(
        sql`CASE WHEN ${assessmentInstance.status} != 'completed' THEN 0 ELSE 1 END`,
        desc(assessmentInstance.createdAt),
      )
      .limit(pageSize)
      .offset(offset);

    const items = rows.map((row) => ({
      id: row.id,
      period: row.period,
      position: row.position,
      totalScore: row.totalScore
        ? Math.round(Number(row.totalScore) * 100) / 100
        : undefined,
      grade: row.grade,
      status: row.status,
      selfSignAt: row.selfSignAt?.toISOString(),
      supervisorSignAt: row.supervisorSignAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total };
  }

  async trend(
    userId: string,
    year?: string,
  ): Promise<MyAssessmentTrendResponse> {
    const employeeFilter = sql`(${assessmentInstance.employeeId}).user_id = ${userId}`;
    const conditions: ReturnType<typeof and>[] = [
      employeeFilter,
      sql`${assessmentInstance.totalScore} IS NOT NULL`,
    ];
    if (year) {
      conditions.push(sql`${assessmentInstance.period} >= ${`${year}-01`}`);
      conditions.push(sql`${assessmentInstance.period} <= ${`${year}-12`}`);
    }
    const completedFilter = and(...conditions);

    const rows = await this.db
      .select({
        period: assessmentInstance.period,
        avgScore: avg(assessmentInstance.totalScore),
      })
      .from(assessmentInstance)
      .where(completedFilter)
      .groupBy(assessmentInstance.period);

    const scoreMap = new Map<string, number>(
      rows.map((row) => [
        row.period,
        row.avgScore ? Math.round(Number(row.avgScore) * 100) / 100 : 0,
      ]),
    );

    const allPeriods = year
      ? this.generateYearPeriods(year)
      : this.generateRecentPeriods(12);
    const items = allPeriods.map((p) => ({
      period: p,
      avgScore: scoreMap.has(p) ? (scoreMap.get(p) as number) : null,
    }));

    return { items };
  }

  async summary(
    userId: string,
    year?: string,
  ): Promise<MyAssessmentSummary> {
    const employeeFilter = sql`(${assessmentInstance.employeeId}).user_id = ${userId}`;
    const conditions: ReturnType<typeof and>[] = [employeeFilter];
    if (year) {
      conditions.push(sql`${assessmentInstance.period} >= ${`${year}-01`}`);
      conditions.push(sql`${assessmentInstance.period} <= ${`${year}-12`}`);
    }
    const whereClause = and(...conditions);

    const countResult = await this.db
      .select({
        status: assessmentInstance.status,
        cnt: count(),
      })
      .from(assessmentInstance)
      .where(whereClause)
      .groupBy(assessmentInstance.status);

    let totalCount = 0;
    let completedCount = 0;
    for (const row of countResult) {
      totalCount += Number(row.cnt);
      if (row.status === 'completed') completedCount += Number(row.cnt);
    }
    const pendingCount = totalCount - completedCount;

    const avgResult = await this.db
      .select({ avgScore: avg(assessmentInstance.totalScore) })
      .from(assessmentInstance)
      .where(and(whereClause, sql`${assessmentInstance.totalScore} IS NOT NULL`));
    const avgScore = avgResult[0]?.avgScore
      ? Math.round(Number(avgResult[0].avgScore) * 100) / 100
      : 0;

    const latestResult = await this.db
      .select({ grade: assessmentInstance.grade })
      .from(assessmentInstance)
      .where(and(whereClause, eq(assessmentInstance.status, 'completed')))
      .orderBy(desc(assessmentInstance.completedAt))
      .limit(1);
    const latestGrade = latestResult[0]?.grade;

    return { totalCount, completedCount, pendingCount, avgScore, latestGrade };
  }

  private generateRecentPeriods(monthCount: number): string[] {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    const result: string[] = [];

    for (let i = 0; i < monthCount; i++) {
      result.push(`${year}-${String(month).padStart(2, '0')}`);
      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
    }

    return result.reverse();
  }

  private generateYearPeriods(year: string): string[] {
    const periods: string[] = [];
    for (let month = 1; month <= 12; month++) {
      periods.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    return periods;
  }
}

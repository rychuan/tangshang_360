import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, sql, count, desc, isNull } from 'drizzle-orm';
import { employee, assessmentInstance, department } from '../../database/schema';
import type {
  TeamOverviewResponse,
  SubordinateRecord,
  SubordinatesResponse,
  RemindRequest,
  RemindResponse,
  RemindResult,
} from '@shared/api.interface';

function buildEmployeeIdInCondition(
  col: typeof assessmentInstance.employeeId,
  ids: string[],
) {
  if (ids.length === 0) return sql`FALSE`;
  const chunks = ids.map((id) => sql`(${col}).user_id = ${id}`);
  return sql.join(chunks, sql` OR `);
}

@Injectable()
export class TeamPerformanceService {
  private readonly logger = new Logger(TeamPerformanceService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
  ) {}

  async getOverview(userId: string): Promise<TeamOverviewResponse> {
    const subRows = await this.db
      .select({ userId: sql<string>`(${employee.id}).user_id` })
      .from(employee)
      .where(and(
        sql`(
          (${employee.supervisorId}).user_id = ${userId}
          OR ${employee.department} IN (SELECT ${department.name} FROM ${department} WHERE (${department.headId}).user_id = ${userId})
        )`,
        isNull(employee.deletedAt),
      ));
    const subordinateIds: string[] = subRows.map(
      (r: { userId: string }) => r.userId,
    );

    if (subordinateIds.length === 0) {
      return {
        totalSubordinates: 0,
        waitingSelfReview: 0,
        readyForSupervisorReview: 0,
        completedCount: 0,
      };
    }

    const empInCond = buildEmployeeIdInCondition(
      assessmentInstance.employeeId,
      subordinateIds,
    );

    const statsRow = await this.db
      .select({
        selfReviewCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'self_review')::int`,
        supervisorReviewCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'supervisor_review')::int`,
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'completed')::int`,
        avgScore: sql<number | null>`AVG(${assessmentInstance.totalScore}) FILTER (WHERE ${assessmentInstance.status} = 'completed' AND ${assessmentInstance.totalScore} IS NOT NULL)`,
      })
      .from(assessmentInstance)
      .where(empInCond);

    const gradeRows = await this.db
      .select({
        grade: assessmentInstance.grade,
        cnt: count(),
      })
      .from(assessmentInstance)
      .where(
        and(
          empInCond,
          eq(assessmentInstance.status, 'completed'),
          sql`${assessmentInstance.totalScore} IS NOT NULL`,
          sql`${assessmentInstance.grade} IS NOT NULL`,
        ),
      )
      .groupBy(assessmentInstance.grade);

    const gradeDistribution: Record<string, number> = {};
    for (const row of gradeRows) {
      if (row.grade) {
        gradeDistribution[row.grade] = Number(row.cnt);
      }
    }

    const stats = statsRow[0];

    return {
      totalSubordinates: subordinateIds.length,
      waitingSelfReview: stats.selfReviewCount,
      readyForSupervisorReview: stats.supervisorReviewCount,
      completedCount: stats.completedCount,
      avgScore: stats.avgScore
        ? Math.round(Number(stats.avgScore) * 100) / 100
        : undefined,
      gradeDistribution:
        Object.keys(gradeDistribution).length > 0
          ? gradeDistribution
          : undefined,
    };
  }

  async getSubordinates(
    userId: string,
    page: number,
    pageSize: number,
    status?: string,
  ): Promise<SubordinatesResponse> {
    const subRows = await this.db
      .select({ userId: sql<string>`(${employee.id}).user_id` })
      .from(employee)
      .where(and(
        sql`(
          (${employee.supervisorId}).user_id = ${userId}
          OR ${employee.department} IN (SELECT ${department.name} FROM ${department} WHERE (${department.headId}).user_id = ${userId})
        )`,
        isNull(employee.deletedAt),
      ));
    const subordinateIds: string[] = subRows.map(
      (r: { userId: string }) => r.userId,
    );

    if (subordinateIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    const empInCond = buildEmployeeIdInCondition(
      assessmentInstance.employeeId,
      subordinateIds,
    );

    const whereConditions: Parameters<typeof and> = [empInCond];
    if (status) {
      whereConditions.push(eq(assessmentInstance.status, status));
    }

    const countResult = await this.db
      .select({ cnt: count() })
      .from(assessmentInstance)
      .where(and(...whereConditions));
    const total = Number(countResult[0].cnt);

    const offset = (page - 1) * pageSize;

    const dataResult = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        employeeId: sql<string>`(${assessmentInstance.employeeId}).user_id`,
        position: assessmentInstance.position,
        status: assessmentInstance.status,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        employeeName: sql<string>`(SELECT name FROM employee emp WHERE (emp.id).user_id = (${assessmentInstance.employeeId}).user_id AND emp.deleted_at IS NULL LIMIT 1)`,
        department: sql<string>`(SELECT department FROM employee emp WHERE (emp.id).user_id = (${assessmentInstance.employeeId}).user_id AND emp.deleted_at IS NULL LIMIT 1)`,
      })
      .from(assessmentInstance)
      .where(and(...whereConditions))
      .orderBy(desc(assessmentInstance.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items: SubordinateRecord[] = dataResult.map(
      (row: {
        id: string;
        period: string;
        employeeId: string;
        position: string;
        status: string;
        totalScore: string | null;
        grade: string | null;
        employeeName: string;
        department: string;
      }) => ({
        id: row.id,
        period: row.period,
        employeeId: row.employeeId,
        employeeName: row.employeeName || '',
        department: row.department || '',
        position: row.position,
        status: row.status,
        totalScore: row.totalScore != null ? Number(row.totalScore) : undefined,
        grade: row.grade || undefined,
      }),
    );

    return { items, total, page, pageSize };
  }

  async remind(
    userId: string,
    body: RemindRequest,
  ): Promise<RemindResponse> {
    const results: RemindResult[] = [];

    for (const instanceId of body.instanceIds) {
      const rows = await this.db
        .select({
          period: assessmentInstance.period,
          employeeUserId: sql<string>`(${assessmentInstance.employeeId}).user_id`,
          employeeName: sql<string>`(SELECT name FROM employee emp WHERE (emp.id).user_id = (${assessmentInstance.employeeId}).user_id AND emp.deleted_at IS NULL LIMIT 1)`,
        })
        .from(assessmentInstance)
        .where(
          and(
            eq(assessmentInstance.id, instanceId),
            sql`(
              (${assessmentInstance.supervisorId}).user_id = ${userId}
              OR (${assessmentInstance.employeeId}).user_id IN (
                SELECT (${employee.id}).user_id FROM ${employee}
                WHERE ${employee.department} IN (
                  SELECT ${department.name} FROM ${department} WHERE (${department.headId}).user_id = ${userId}
                )
                AND ${employee.deletedAt} IS NULL
              )
            )`,
          ),
        )
        .limit(1);

      if (rows.length === 0) {
        this.logger.warn(
          `Instance ${instanceId} not found or not owned by supervisor ${userId}`,
        );
        results.push({
          instanceId,
          status: 'failed',
          reason: '考核实例不存在或无权操作',
        });
        continue;
      }

      const row = rows[0];
      const employeeName: string = row.employeeName || '';
      const period: string = row.period;
      const employeeUserId: string = row.employeeUserId;

      const message = `**考核催办提醒**\n\n[${period}] ${employeeName} 您好，您的考核尚未完成自评，请及时登录系统处理。`;

      try {
        await this.capabilityService
          .load('assessment_reminder_feishu_send_1')
          .call('send_feishu_message', {
            receiverUserList: [employeeUserId],
            cardContentMarkdown: message,
          });

        this.logger.log(
          `Reminder sent to ${employeeName} (${employeeUserId}) for instance ${instanceId}`,
        );
        results.push({ instanceId, status: 'sent' });
      } catch (err) {
        this.logger.warn(
          `Failed to send reminder to ${employeeName} (${employeeUserId}): ${err}`,
        );
        results.push({
          instanceId,
          status: 'failed',
          reason: `发送消息失败: ${err}`,
        });
      }
    }

    return { success: true, results };
  }
}

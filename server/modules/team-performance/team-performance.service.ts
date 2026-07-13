import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, inArray, sql, count, desc } from 'drizzle-orm';
import { employee, assessmentInstance } from '../../database/schema';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { assertBatchSize } from '@server/common/utils/batch';
import { buildEmployeeIdInCondition } from './employee-scope-condition';
import type {
  TeamOverviewResponse,
  SubordinateRecord,
  SubordinatesResponse,
  RemindRequest,
  RemindResponse,
  RemindResult,
} from '@shared/api.interface';

@Injectable()
export class TeamPerformanceService {
  private readonly logger = new Logger(TeamPerformanceService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async getOverview(
    userId: string,
    periods?: string[],
  ): Promise<TeamOverviewResponse> {
    const subordinateIds = await this.accessScopeService.getManagedEmployeeIds(
      userId,
      { includeSelf: false },
    );

    if (subordinateIds.length === 0) {
      return {
        totalSubordinates: 0,
        waitingSelfReview: 0,
        readyForSupervisorReview: 0,
        completedCount: 0,
        totalInstanceCount: 0,
      };
    }

    const empInCond = buildEmployeeIdInCondition(
      assessmentInstance.employeeId,
      subordinateIds,
    );

    const periodCond = periods?.length
      ? inArray(assessmentInstance.period, periods)
      : undefined;
    const statsWhere = periodCond ? and(empInCond, periodCond) : empInCond;

    const statsRow = await this.db
      .select({
        selfReviewCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'self_review')::int`,
        supervisorReviewCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'supervisor_review')::int`,
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${assessmentInstance.status} = 'completed')::int`,
        totalCount: sql<number>`COUNT(*)::int`,
        avgScore: sql<
          number | null
        >`AVG(${assessmentInstance.totalScore}) FILTER (WHERE ${assessmentInstance.status} = 'completed' AND ${assessmentInstance.totalScore} IS NOT NULL)`,
      })
      .from(assessmentInstance)
      .where(statsWhere);

    const gradeWhere = periodCond
      ? and(empInCond, eq(assessmentInstance.status, 'completed'), periodCond)
      : and(empInCond, eq(assessmentInstance.status, 'completed'));

    const gradeRows = await this.db
      .select({
        grade: assessmentInstance.grade,
        cnt: count(),
      })
      .from(assessmentInstance)
      .where(
        and(
          gradeWhere,
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
      totalInstanceCount: Number(stats.totalCount),
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
    periods?: string[],
  ): Promise<SubordinatesResponse> {
    const subordinateIds = await this.accessScopeService.getManagedEmployeeIds(
      userId,
      { includeSelf: false },
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
    if (periods?.length) {
      whereConditions.push(inArray(assessmentInstance.period, periods));
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
        employeeName: employee.name,
        department: employee.department,
      })
      .from(assessmentInstance)
      .leftJoin(
        employee,
        sql`(${employee.employeeId}).user_id = (${assessmentInstance.employeeId}).user_id AND ${employee.deletedAt} IS NULL`,
      )
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
        employeeName: string | null;
        department: string | null;
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

  async remind(userId: string, body: RemindRequest): Promise<RemindResponse> {
    assertBatchSize(body.instanceIds, '实例');
    const results: RemindResult[] = [];

    for (const instanceId of body.instanceIds) {
      const rows = await this.db
        .select({
          period: assessmentInstance.period,
          status: assessmentInstance.status,
          employeeUserId: sql<string>`(${assessmentInstance.employeeId}).user_id`,
          employeeName: sql<string>`COALESCE((SELECT name FROM employee e WHERE (e.employee_id).user_id = (${assessmentInstance.employeeId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
        })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, instanceId))
        .limit(1);

      if (rows.length === 0) {
        this.logger.warn(`Instance ${instanceId} not found`);
        results.push({
          instanceId,
          status: 'failed',
          reason: '考核实例不存在',
        });
        continue;
      }

      const row = rows[0];

      // P0: 状态校验 — 仅 self_review 状态允许催办
      if (row.status !== 'self_review') {
        results.push({
          instanceId,
          status: 'failed',
          reason: '当前考核状态不允许催办',
        });
        continue;
      }

      const employeeUserId: string = row.employeeUserId;

      const canAccess = await this.accessScopeService.canAccessEmployee(
        userId,
        employeeUserId,
        { includeSelf: false },
      );
      if (!canAccess) {
        this.logger.warn(
          `Instance ${instanceId} not authorized for user ${userId}`,
        );
        results.push({
          instanceId,
          status: 'failed',
          reason: '考核实例不存在或无权操作',
        });
        continue;
      }

      const employeeName: string = row.employeeName || '';
      const period: string = row.period;

      const message = `**考核催办提醒**\n\n[${period}] ${employeeName} 您好，您的考核尚未完成自评，请及时登录系统处理。`;

      try {
        await this.capabilityService
          .load('assessment_reminder_feishu_send_1')
          .call('send_feishu_message', {
            title: { title: '考核催办提醒' },
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

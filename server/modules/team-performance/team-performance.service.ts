import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
import { UnlockService } from '../assessment-publish/unlock.service';
import type {
  TeamOverviewResponse,
  SubordinateRecord,
  SubordinatesResponse,
  RemindRequest,
  RemindResponse,
  RemindResult,
  UnlockRequest,
} from '@shared/api.interface';

@Injectable()
export class TeamPerformanceService {
  private readonly logger = new Logger(TeamPerformanceService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly accessScopeService: AccessScopeService,
    private readonly unlockService: UnlockService,
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

    if (body.instanceIds.length === 0) {
      return { success: true, results };
    }

    // 批量查询实例（状态 + 员工信息），避免逐条 SELECT
    const instances = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        status: assessmentInstance.status,
        employeeUserId: sql<string>`(${assessmentInstance.employeeId}).user_id`,
        employeeName: sql<string>`COALESCE((SELECT name FROM employee e WHERE (e.employee_id).user_id = (${assessmentInstance.employeeId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(assessmentInstance)
      .where(inArray(assessmentInstance.id, body.instanceIds));

    const instanceMap = new Map(instances.map((inst) => [inst.id, inst]));

    // 一次完成全部实例的范围判定（内部仅一次 getScope + 一次员工查询）
    const employeeUserIds = [
      ...new Set(instances.map((inst) => inst.employeeUserId)),
    ];
    const accessMap =
      employeeUserIds.length > 0
        ? await this.accessScopeService.canAccessEmployees(
            userId,
            employeeUserIds,
            { includeSelf: false },
          )
        : new Map<string, boolean>();

    for (const instanceId of body.instanceIds) {
      const inst = instanceMap.get(instanceId);
      if (!inst) {
        this.logger.warn(`Instance ${instanceId} not found`);
        results.push({
          instanceId,
          status: 'failed',
          reason: '考核实例不存在',
        });
        continue;
      }

      if (!(accessMap.get(inst.employeeUserId) ?? false)) {
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

      // P0: 状态校验 — 仅 self_review 状态允许催办
      if (inst.status !== 'self_review') {
        results.push({
          instanceId,
          status: 'failed',
          reason: '当前考核状态不允许催办',
        });
        continue;
      }

      const employeeName: string = inst.employeeName || '';
      const period: string = inst.period;

      const message = `**考核催办提醒**\n\n[${period}] ${employeeName} 您好，您的考核尚未完成自评，请及时登录系统处理。`;

      try {
        await this.capabilityService
          .load('assessment_reminder_feishu_send_1')
          .call('send_feishu_message', {
            receiverUserList: [inst.employeeUserId],
            cardContentMarkdown: message,
          });

        this.logger.log(
          `Reminder sent to ${employeeName} (${inst.employeeUserId}) for instance ${instanceId}`,
        );
        results.push({ instanceId, status: 'sent' });
      } catch (err) {
        this.logger.warn(
          `Failed to send reminder to ${employeeName} (${inst.employeeUserId}): ${err}`,
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

  // 团队绩效解锁仅限员工已完成、上级未完成评分时：
  // pending_sign（员工已提交待签字）/ supervisor_review（上级评分中），
  // 员工评分中（self_review）与评分完成后（supervisor_sign/completed）冻结
  private readonly UNLOCKABLE_STATUSES = new Set([
    'pending_sign',
    'supervisor_review',
  ]);

  /**
   * 部门负责人/上级解锁考核实例（回退到可修改状态）
   * 先校验状态，再复用 UnlockService 的完整规则：状态回退、评分/签名重置、审计日志
   */
  async unlock(
    instanceId: string,
    body: UnlockRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const [instance] = await this.db
      .select({ status: assessmentInstance.status })
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, instanceId))
      .limit(1);

    if (!instance) {
      throw new NotFoundException('考核实例不存在');
    }
    if (!this.UNLOCKABLE_STATUSES.has(instance.status)) {
      throw new BadRequestException(
        '当前考核状态不允许解锁：仅员工已完成、上级未完成时可解锁',
      );
    }

    return this.unlockService.unlock(instanceId, body, userId);
  }
}

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, isNull, inArray, desc, type SQL } from 'drizzle-orm';
import {
  assessmentInstance,
  employee,
  auditLog,
} from '@server/database/schema';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { runWithConcurrency } from '@server/common/utils/batch';
import {
  buildReminderNotificationMessages,
  normalizeAppBaseUrl,
  summarizeReminderTargets,
  type AssessmentNotificationMessage,
} from '@server/common/assessment/notification';
import type {
  ReminderPreviewResponse,
  UnfinishedReminderRequest,
  UnfinishedReminderResponse,
} from '@shared/api.interface';
import { getPublishedAssessmentStatuses } from './status';

type ReminderTarget = {
  instanceId: string;
  period: string;
  employeeId: string;
  employeeName: string;
  supervisorId?: string;
  status: string;
};

/**
 * 未完成考核提醒域：筛选未完成实例 → 组装飞书通知消息 → 并发发送 + 审计。
 * 与发布/解锁域解耦，仅依赖 db + capabilityService + AccessScopeService。
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  private async getUnfinishedReminderTargets(
    periods: string[],
    department: string | undefined,
    status: string | undefined,
    grade: string | undefined,
    userId: string,
  ): Promise<ReminderTarget[]> {
    if (!periods || periods.length === 0) {
      throw new BadRequestException('绩效周期不能为空');
    }

    const conditions: SQL[] = [
      periods.length === 1
        ? eq(assessmentInstance.period, periods[0])
        : inArray(assessmentInstance.period, periods),
      inArray(assessmentInstance.status, [
        'self_review',
        'pending_sign',
        'supervisor_review',
        'supervisor_sign',
      ]),
      isNull(employee.deletedAt),
    ];
    if (department) {
      conditions.push(eq(employee.department, department));
    }
    if (status) {
      conditions.push(
        inArray(
          assessmentInstance.status,
          getPublishedAssessmentStatuses(status),
        ),
      );
    }
    if (grade) {
      conditions.push(eq(assessmentInstance.grade, grade));
    }
    const scopeCondition =
      await this.accessScopeService.buildEmployeeScopeCondition(userId, {
        includeSelf: false,
      });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    const rows = await this.db
      .select({
        instanceId: assessmentInstance.id,
        period: assessmentInstance.period,
        employeeId: assessmentInstance.employeeId,
        employeeName: employee.name,
        supervisorId: assessmentInstance.supervisorId,
        status: assessmentInstance.status,
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        eq(assessmentInstance.employeeId, employee.employeeId),
      )
      .where(and(...conditions))
      .orderBy(desc(assessmentInstance.createdAt));

    return rows.map((row) => ({
      instanceId: row.instanceId,
      period: row.period,
      employeeId: row.employeeId,
      employeeName: row.employeeName ?? '未命名员工',
      supervisorId: row.supervisorId ?? undefined,
      status: row.status,
    }));
  }

  async sendNotificationMessages(
    messages: AssessmentNotificationMessage[],
  ): Promise<{ sentCount: number; failedCount: number }> {
    const results = await runWithConcurrency(messages, 5, async (message) => {
      try {
        await this.capabilityService
          .load('assessment_reminder_feishu_send_1')
          .call('send_feishu_message', {
            receiverUserList: [message.receiverId],
            cardContentMarkdown: message.markdown,
          });
        return true;
      } catch (err) {
        this.logger.warn(
          `Failed to send ${message.title} to ${message.receiverId}: ${err}`,
        );
        return false;
      }
    });

    const sentCount = results.filter(Boolean).length;
    return {
      sentCount,
      failedCount: results.length - sentCount,
    };
  }

  async previewUnfinishedReminders(
    periods: string[],
    department: string,
    status: string,
    grade: string,
    userId: string,
  ): Promise<ReminderPreviewResponse> {
    const targets = await this.getUnfinishedReminderTargets(
      periods,
      department || undefined,
      status || undefined,
      grade || undefined,
      userId,
    );
    return summarizeReminderTargets(targets);
  }

  async remindUnfinishedAssessments(
    body: UnfinishedReminderRequest,
    userId: string,
  ): Promise<UnfinishedReminderResponse> {
    const appBaseUrl = normalizeAppBaseUrl(body.appBaseUrl);
    const periodList = body.periods?.length
      ? body.periods
      : body.period
        ? [body.period]
        : [];
    const targets = await this.getUnfinishedReminderTargets(
      periodList,
      body.department,
      body.status,
      body.grade,
      userId,
    );
    const preview = summarizeReminderTargets(targets);

    const outcomes = await runWithConcurrency(targets, 5, async (target) => {
      const messages = buildReminderNotificationMessages({
        ...target,
        appBaseUrl,
      });
      const delivery = await this.sendNotificationMessages(messages);

      try {
        await this.db.insert(auditLog).values({
          operatorId: userId,
          action: 'remind',
          targetType: 'assessment_instance',
          targetId: target.instanceId,
          changes: {
            status: target.status,
            recipients: messages.map((message) => ({
              userId: message.receiverId,
              role: message.recipientRole,
            })),
            sentCount: delivery.sentCount,
            failedCount: delivery.failedCount,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to write reminder audit for ${target.instanceId}: ${err}`,
        );
      }

      return delivery;
    });

    const sentCount = outcomes.reduce(
      (total, outcome) => total + outcome.sentCount,
      0,
    );
    const failedCount = outcomes.reduce(
      (total, outcome) => total + outcome.failedCount,
      0,
    );

    return {
      ...preview,
      success: failedCount === 0,
      sentCount,
      failedCount,
    };
  }
}

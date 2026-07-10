import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import {
  and,
  eq,
  lte,
  ne,
  count,
  desc,
  asc,
  sql,
  isNull,
  type SQL,
} from 'drizzle-orm';
import {
  employee,
  employeeBinding,
  assessmentTemplate,
  assessmentInstance,
  assessmentIndicatorSnapshot,
  assessmentIndicator,
  assessmentDimension,
  ratingRecord,
  auditLog,
  department,
} from '@server/database/schema';
import { EmployeeSnapshotService } from '../employee-snapshot/employee-snapshot.service';
import { RoleManagerService } from '../role-manager/role-manager.service';
import type {
  PublishEmployeeItem,
  PublishRequest,
  PublishResponse,
  AssessmentInstanceItem,
  AssessmentInstanceListResponse,
  AdjustRequest,
  UnlockRequest,
  AdjustIndicatorInput,
  PeriodStatisticsResponse,
  InstanceIndicatorsResponse,
  InstanceIndicatorItem,
  EmployeeSnapshotResponse,
  BatchOperationResponse,
  UnlockHistoryItem,
} from '@shared/api.interface';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'id'): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException(`${label} 格式无效`);
  }
}

export type UnlockRule = {
  newStatus: string;
  resetRatingTypes?: string[];
  clearSigns?: 'all';
};

const UNLOCK_RULES: Record<string, UnlockRule> = {
  completed: { newStatus: 'pending_sign', clearSigns: 'all' },
  pending_sign: {
    newStatus: 'supervisor_review',
    resetRatingTypes: ['supervisor'],
    clearSigns: 'all',
  },
  supervisor_review: {
    newStatus: 'self_review',
    resetRatingTypes: ['self', 'supervisor'],
  },
  self_review: {
    newStatus: 'self_review',
    resetRatingTypes: ['self'],
  },
};

export function getUnlockRule(status: string): UnlockRule {
  const rule = UNLOCK_RULES[status];
  if (!rule) {
    throw new BadRequestException(`当前状态 ${status} 不允许解锁`);
  }
  return rule;
}

export function getUnlockUpdateData(rule: UnlockRule): {
  status: string;
  totalScore: null;
  grade: null;
  selfSignName?: null;
  selfSignAt?: null;
  selfSignImage?: null;
  supervisorSignName?: null;
  supervisorSignAt?: null;
  supervisorSignImage?: null;
} {
  const updateData: {
    status: string;
    totalScore: null;
    grade: null;
    selfSignName?: null;
    selfSignAt?: null;
    selfSignImage?: null;
    supervisorSignName?: null;
    supervisorSignAt?: null;
    supervisorSignImage?: null;
  } = {
    status: rule.newStatus,
    totalScore: null,
    grade: null,
  };
  if (rule.clearSigns === 'all') {
    updateData.selfSignName = null;
    updateData.selfSignAt = null;
    updateData.selfSignImage = null;
    updateData.supervisorSignName = null;
    updateData.supervisorSignAt = null;
    updateData.supervisorSignImage = null;
  }
  return updateData;
}

@Injectable()
export class AssessmentPublishService {
  private readonly logger: Logger = new Logger(AssessmentPublishService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly employeeSnapshotService: EmployeeSnapshotService,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  private async buildPublishEmployeeScope(userId: string): Promise<SQL | null> {
    const roles = await this.roleManagerService.getUserRoles(userId);
    if (roles.includes('admin') || roles.includes('hrd')) {
      return null;
    }

    const deptRows = await this.db
      .select({ id: department.id })
      .from(department)
      .where(sql`(${department.headId}).user_id = ${userId}`);
    const deptIds = deptRows.map((d: { id: string }) => d.id);

    const supervisorCondition = sql`(${employee.supervisorId}).user_id = ${userId}`;
    const departmentCondition =
      deptIds.length > 0
        ? sql`${employee.departmentId} IN (${sql.join(
            deptIds.map((id: string) => sql`${id}`),
            sql`, `,
          )})`
        : sql`FALSE`;

    return sql`((${supervisorCondition}) OR (${departmentCondition}))`;
  }

  async listEmployees(
    period: string,
    department: string,
    templateId: string,
    userId: string,
  ): Promise<{ items: PublishEmployeeItem[] }> {
    this.logger.log(
      `listEmployees period=${period} department=${department} templateId=${templateId}`,
    );
    if (!period) {
      return { items: [] };
    }
    const conditions: SQL[] = [
      eq(employeeBinding.status, true),
      lte(employeeBinding.effectiveFrom, period),
      isNull(employee.deletedAt),
      eq(employee.status, true),
      eq(assessmentTemplate.isActive, true),
      sql`NOT EXISTS (SELECT 1 FROM ${assessmentInstance} WHERE (${assessmentInstance.employeeId}).user_id = (${employeeBinding.employeeId}).user_id AND ${assessmentInstance.period} = ${period})`,
    ];
    if (department) {
      conditions.push(eq(employee.department, department));
    }
    if (templateId) {
      conditions.push(eq(employeeBinding.templateId, templateId));
    }
    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }
    const rows = await this.db
      .select({
        employeeId: employee.employeeId,
        employeeName: employee.name,
        position: employee.position,
        department: employee.department,
        templateId: assessmentTemplate.id,
        templateName: assessmentTemplate.name,
      })
      .from(employeeBinding)
      .innerJoin(employee, eq(employeeBinding.employeeId, employee.employeeId))
      .innerJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .where(and(...conditions));

    const items: PublishEmployeeItem[] = rows.map(
      (row: (typeof rows)[number]) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        position: row.position,
        department: row.department,
        templateId: row.templateId,
        templateName: row.templateName,
      }),
    );

    return { items };
  }

  async publish(
    body: PublishRequest,
    userId: string,
  ): Promise<PublishResponse> {
    const { period, employeeIds } = body;
    this.logger.log(
      `publish period=${period} employeeIds=${JSON.stringify(employeeIds)}`,
    );

    const targetEmployeeIds: string[] =
      employeeIds && employeeIds.length > 0
        ? employeeIds
        : await this.getEmployeeIdsForPeriod(period);

    if (targetEmployeeIds.length === 0) {
      throw new BadRequestException('没有符合条件的员工可发布');
    }

    const publishedAt: Date = new Date();
    let publishedCount: number = 0;
    const publishedInstances: Array<{
      employeeId: string;
      instanceId: string;
      employeeName: string;
      period: string;
    }> = [];

    for (const empId of targetEmployeeIds) {
      // === P0: 防止重复发布（同员工同月份） ===
      const existingInstances = await this.db
        .select({ id: assessmentInstance.id })
        .from(assessmentInstance)
        .where(
          and(
            eq(assessmentInstance.employeeId, empId),
            eq(assessmentInstance.period, period),
          ),
        )
        .limit(1);

      if (existingInstances.length > 0) {
        this.logger.log(
          `skip employee ${empId}: already has instance for period ${period}`,
        );
        continue;
      }

      const bindingRows = await this.db
        .select()
        .from(employeeBinding)
        .where(
          and(
            eq(employeeBinding.employeeId, empId),
            eq(employeeBinding.status, true),
            lte(employeeBinding.effectiveFrom, period),
          ),
        )
        .limit(1);

      if (bindingRows.length === 0) {
        this.logger.log(
          `skip employee ${empId}: no active binding for period ${period}`,
        );
        continue;
      }

      const binding = bindingRows[0];
      const templateId: string = binding.templateId;

      const templateRows = await this.db
        .select({
          id: assessmentTemplate.id,
          isActive: assessmentTemplate.isActive,
        })
        .from(assessmentTemplate)
        .where(eq(assessmentTemplate.id, templateId))
        .limit(1);

      if (templateRows.length === 0) {
        this.logger.log(
          `skip employee ${empId}: template ${templateId} not found`,
        );
        continue;
      }

      if (!templateRows[0].isActive) {
        this.logger.warn(
          `skip employee ${empId}: template ${templateId} is inactive`,
        );
        continue;
      }

      const empRows = await this.db
        .select()
        .from(employee)
        .where(and(eq(employee.employeeId, empId), isNull(employee.deletedAt)))
        .limit(1);

      if (empRows.length === 0) {
        this.logger.log(`skip employee ${empId}: employee not found`);
        continue;
      }

      const empRecord = empRows[0];

      if (!empRecord.status) {
        this.logger.warn(
          `skip employee ${empId}: employee status is '${empRecord.status ? 'active' : 'inactive'}'`,
        );
        continue;
      }

      if (!empRecord.supervisorId) {
        this.logger.warn(
          `employee ${empId} has no supervisor — supervisor review will be blocked`,
        );
      }

      // 检查模板是否有指标
      const indicatorCountResult = await this.db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(assessmentIndicator)
        .innerJoin(
          assessmentDimension,
          eq(assessmentIndicator.dimensionId, assessmentDimension.id),
        )
        .where(eq(assessmentDimension.templateId, templateId));

      if (Number(indicatorCountResult[0]?.cnt ?? 0) === 0) {
        throw new BadRequestException(
          `模板 ${templateId} 没有配置考核指标，无法发布员工 ${empId}`,
        );
      }
      const empPosition: string = empRecord.position;
      const empSupervisorId: string | null = empRecord.supervisorId;

      // 事务包裹每个员工的发布写入（实例创建 + 快照复制 + 审计日志）
      await this.db.transaction(async (tx: any) => {
        const [instance] = await tx
          .insert(assessmentInstance)
          .values({
            period,
            employeeId: empId,
            supervisorId: empSupervisorId,
            position: empPosition,
            templateId,
            status: 'self_review',
            publishedBy: userId,
            publishedAt,
          })
          .returning({ id: assessmentInstance.id });

        const instanceId: string = instance.id;

        const hasSnap: boolean =
          await this.employeeSnapshotService.hasSnapshot(empId, tx);
        if (hasSnap) {
          await this.employeeSnapshotService.copyToInstance(
            empId,
            instanceId,
            tx,
          );
        } else {
          await this.employeeSnapshotService.generateFromTemplate(
            empId,
            templateId,
            userId,
            tx,
          );
          await this.employeeSnapshotService.copyToInstance(
            empId,
            instanceId,
            tx,
          );
        }

        await tx.insert(auditLog).values({
          operatorId: userId,
          action: 'publish',
          targetType: 'assessment_instance',
          targetId: instanceId,
          changes: { period, employeeId: empId, templateId },
        });

        publishedCount++;
        publishedInstances.push({
          employeeId: empId,
          instanceId,
          employeeName: empRecord.name,
          period,
        });
      });
    }

    // === P1: 发布后异步发送飞书通知（不阻塞响应） ===
    if (publishedInstances.length > 0) {
      Promise.allSettled(
        publishedInstances.map(
          async (pi: { employeeId: string; employeeName: string; period: string }) => {
            try {
              const message = `**考核发布通知**\n\n${pi.period} 月度考核已发布，请尽快登录系统完成自评。`;
              await this.capabilityService
                .load('assessment_reminder_feishu_send_1')
                .call('send_feishu_message', {
                  title: { title: '考核发布通知' },
                  receiverUserList: [pi.employeeId],
                  cardContentMarkdown: message,
                });
              this.logger.log(
                `Published notification sent to ${pi.employeeName} (${pi.employeeId})`,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to send notification to ${pi.employeeName}: ${err}`,
              );
            }
          },
        ),
      ).catch(() => {});
    }

    return { success: true, publishedCount };
  }

  async listInstances(
    period: string,
    page: string,
    pageSize: string,
    status: string,
    department: string,
    grade: string,
    userId: string,
  ): Promise<AssessmentInstanceListResponse> {
    const p: number = parseInt(page, 10) || 1;
    const ps: number = parseInt(pageSize, 10) || 20;
    const offset: number = (p - 1) * ps;

    if (!period) {
      return { items: [], total: 0 };
    }
    const conditions: SQL[] = [
      eq(assessmentInstance.period, period),
      isNull(employee.deletedAt),
    ];
    if (status) {
      conditions.push(eq(assessmentInstance.status, status));
    }
    if (department) {
      conditions.push(eq(employee.department, department));
    }
    if (grade) {
      conditions.push(eq(assessmentInstance.grade, grade));
    }
    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    const totalResult = await this.db
      .select({ count: count() })
      .from(assessmentInstance)
      .innerJoin(employee, eq(assessmentInstance.employeeId, employee.employeeId))
      .where(and(...conditions));

    const total: number = parseInt(String(totalResult[0]?.count ?? '0'), 10);

    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        employeeId: assessmentInstance.employeeId,
        employeeName: employee.name,
        department: employee.department,
        position: assessmentInstance.position,
        supervisorId: assessmentInstance.supervisorId,
        status: assessmentInstance.status,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        publishedAt: assessmentInstance.publishedAt,
        publishedById: assessmentInstance.publishedBy,
        publishedByName: sql<string>`COALESCE((SELECT pub.name FROM employee pub WHERE (pub.employee_id).user_id = (${assessmentInstance.publishedBy}).user_id AND pub.deleted_at IS NULL LIMIT 1), '')`,
        selfReviewSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM ${ratingRecord} WHERE ${ratingRecord.instanceId} = ${assessmentInstance.id} AND ${ratingRecord.ratingType} = 'self' AND ${ratingRecord.isDraft} = false)`,
        supervisorReviewSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM ${ratingRecord} WHERE ${ratingRecord.instanceId} = ${assessmentInstance.id} AND ${ratingRecord.ratingType} = 'supervisor' AND ${ratingRecord.isDraft} = false)`,
        // 2.5: JOIN 上级姓名
        supervisorName: sql<string>`COALESCE((SELECT sup.name FROM employee sup WHERE (sup.employee_id).user_id = (${assessmentInstance.supervisorId}).user_id AND sup.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(assessmentInstance)
      .innerJoin(employee, eq(assessmentInstance.employeeId, employee.employeeId))
      .where(and(...conditions))
      .orderBy(desc(assessmentInstance.createdAt))
      .limit(ps)
      .offset(offset);

    const items: AssessmentInstanceItem[] = rows.map(
      (row: (typeof rows)[number]) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        position: row.position,
        supervisorId: row.supervisorId ?? undefined,
        supervisorName: row.supervisorName,
        status: row.status,
        totalScore: row.totalScore ? Number(row.totalScore) : undefined,
        grade: row.grade ?? undefined,
        publishedAt: row.publishedAt ? String(row.publishedAt) : '',
        publishedById: row.publishedById ?? undefined,
        publishedByName: row.publishedByName,
        selfReviewCompleted: row.selfReviewSubmitted,
        supervisorReviewCompleted: row.supervisorReviewSubmitted,
      }),
    );

    return { items, total };
  }

  async getEmployeeSnapshot(
    employeeId: string,
  ): Promise<EmployeeSnapshotResponse> {
    return this.employeeSnapshotService.getSnapshot(employeeId);
  }

  async adjustEmployeeSnapshot(
    employeeId: string,
    body: AdjustRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(`adjustEmployeeSnapshot employeeId=${employeeId}`);

    const bindingRows = await this.db
      .select({ templateId: employeeBinding.templateId })
      .from(employeeBinding)
      .where(
        and(
          eq(employeeBinding.employeeId, employeeId),
          eq(employeeBinding.status, true),
        ),
      )
      .limit(1);

    if (bindingRows.length === 0) {
      throw new NotFoundException('未找到员工的活跃绑定');
    }

    return this.employeeSnapshotService.adjustSnapshot(
      employeeId,
      bindingRows[0].templateId,
      body.indicators,
      userId,
    );
  }

  async deleteEmployeeSnapshot(
    employeeId: string,
  ): Promise<{ success: boolean }> {
    return this.employeeSnapshotService.deleteSnapshot(employeeId);
  }

  async unlock(
    instanceId: string,
    body: UnlockRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    validateUUID(instanceId);
    this.logger.log(
      `unlock instanceId=${instanceId} reason=${body.reason} userId=${userId}`,
    );

    const instanceRows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, instanceId))
      .limit(1);

    if (instanceRows.length === 0) {
      throw new NotFoundException('考核实例不存在');
    }

    const instance = instanceRows[0];
    const mapped = getUnlockRule(instance.status);

    // 解锁时重置对应评分的草稿状态（支持同时重置多种评分类型）
    if (mapped.resetRatingTypes?.length) {
      for (const ratingType of mapped.resetRatingTypes) {
        await this.db
          .update(ratingRecord)
          .set({
            isDraft: true,
            submittedAt: null,
          })
          .where(
            and(
              eq(ratingRecord.instanceId, instanceId),
              eq(ratingRecord.ratingType, ratingType),
            ),
          );
      }
    }

    const updateData = getUnlockUpdateData(mapped);

    await this.db
      .update(assessmentInstance)
      .set(updateData)
      .where(eq(assessmentInstance.id, instanceId));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'unlock',
      targetType: 'assessment_instance',
      targetId: instanceId,
      reason: body.reason,
      changes: { from: instance.status, to: mapped.newStatus },
    });

    return { success: true };
  }

  async getUnlockHistory(instanceId: string): Promise<UnlockHistoryItem[]> {
    validateUUID(instanceId);
    this.logger.log(`getUnlockHistory instanceId=${instanceId}`);

    const rows = await this.db
      .select({
        id: auditLog.id,
        operatorId: auditLog.operatorId,
        action: auditLog.action,
        changes: auditLog.changes,
        reason: auditLog.reason,
        createdAt: auditLog.createdAt,
        operatorName: employee.name,
      })
      .from(auditLog)
      .leftJoin(
        employee,
        sql`(${auditLog.operatorId}).user_id = (${employee.employeeId}).user_id`,
      )
      .where(
        and(eq(auditLog.targetId, instanceId), eq(auditLog.action, 'unlock')),
      )
      .orderBy(desc(auditLog.createdAt));

    return rows.map(
      (row: {
        id: string;
        operatorId: string;
        action: string;
        changes: unknown;
        reason: string | null;
        createdAt: Date;
        operatorName: string | null;
      }): UnlockHistoryItem => {
        const changes = (row.changes as { from?: string; to?: string }) ?? {};
        return {
          id: row.id,
          operatorName: row.operatorName ?? '未知',
          fromStatus: changes.from ?? '',
          toStatus: changes.to ?? '',
          reason: row.reason ?? '',
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
  }

  async getPeriodStatistics(
    period: string,
    userId: string,
  ): Promise<PeriodStatisticsResponse> {
    this.logger.log(`getPeriodStatistics period=${period}`);

    if (!period) {
      return {
        toPublishCount: 0,
        publishedCount: 0,
        selfReviewCompletedRate: 0,
        pendingCount: 0,
      };
    }

    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    const bindingConditions: SQL[] = [
      eq(employeeBinding.status, true),
      lte(employeeBinding.effectiveFrom, period),
      isNull(employee.deletedAt),
      eq(employee.status, true),
    ];
    if (scopeCondition) {
      bindingConditions.push(scopeCondition);
    }

    const bindingCountResult = await this.db
      .select({ count: count() })
      .from(employeeBinding)
      .innerJoin(employee, eq(employeeBinding.employeeId, employee.employeeId))
      .where(and(...bindingConditions));
    const bindingCount: number = parseInt(
      String(bindingCountResult[0]?.count ?? '0'),
      10,
    );

    const instanceConditions: SQL[] = [
      eq(assessmentInstance.period, period),
      isNull(employee.deletedAt),
    ];
    if (scopeCondition) {
      instanceConditions.push(scopeCondition);
    }

    const publishedCountResult = await this.db
      .select({ count: count() })
      .from(assessmentInstance)
      .innerJoin(employee, eq(assessmentInstance.employeeId, employee.employeeId))
      .where(and(...instanceConditions));
    const publishedCount: number = parseInt(
      String(publishedCountResult[0]?.count ?? '0'),
      10,
    );

    const toPublishCount: number = Math.max(0, bindingCount - publishedCount);

    let selfReviewCompletedRate: number = 0;
    if (publishedCount > 0) {
      const selfReviewCompletedResult = await this.db
        .select({ count: count() })
        .from(assessmentInstance)
        .innerJoin(
          employee,
          eq(assessmentInstance.employeeId, employee.employeeId),
        )
        .where(
          and(
            ...instanceConditions,
            sql`(${assessmentInstance.status} != 'self_review' OR EXISTS(SELECT 1 FROM ${ratingRecord} WHERE ${ratingRecord.instanceId} = ${assessmentInstance.id} AND ${ratingRecord.ratingType} = 'self' AND ${ratingRecord.isDraft} = false))`,
          ),
        );
      const selfReviewCompleted: number = parseInt(
        String(selfReviewCompletedResult[0]?.count ?? '0'),
        10,
      );
      selfReviewCompletedRate = Math.round(
        (selfReviewCompleted / publishedCount) * 100,
      );
    }

    const pendingCountResult = await this.db
      .select({ count: count() })
      .from(assessmentInstance)
      .innerJoin(employee, eq(assessmentInstance.employeeId, employee.employeeId))
      .where(
        and(
          ...instanceConditions,
          ne(assessmentInstance.status, 'completed'),
        ),
      );
    const pendingCount: number = parseInt(
      String(pendingCountResult[0]?.count ?? '0'),
      10,
    );

    return {
      toPublishCount,
      publishedCount,
      selfReviewCompletedRate,
      pendingCount,
    };
  }

  async getInstanceIndicators(
    instanceId: string,
  ): Promise<InstanceIndicatorsResponse> {
    validateUUID(instanceId);
    this.logger.log(`getInstanceIndicators instanceId=${instanceId}`);
    const rows = await this.db
      .select({
        content: assessmentIndicatorSnapshot.content,
        description: assessmentIndicatorSnapshot.description,
        algorithm: assessmentIndicatorSnapshot.algorithm,
        dataSource: assessmentIndicatorSnapshot.dataSource,
        weight: assessmentIndicatorSnapshot.weight,
        dimensionName: assessmentIndicatorSnapshot.dimensionName,
        dimensionWeight: assessmentIndicatorSnapshot.dimensionWeight,
        sortOrder: assessmentIndicatorSnapshot.sortOrder,
      })
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, instanceId))
      .orderBy(asc(assessmentIndicatorSnapshot.sortOrder));

    const indicators: InstanceIndicatorItem[] = rows.map(
      (row: (typeof rows)[number]) => ({
        content: row.content,
        description: row.description ?? '',
        algorithm: row.algorithm ?? '',
        dataSource: row.dataSource ?? '',
        weight: Number(row.weight),
        dimensionName: row.dimensionName,
        dimensionWeight: Number(row.dimensionWeight),
      }),
    );

    return { indicators };
  }

  async batchUnlock(
    instanceIds: string[],
    reason: string,
    userId: string,
  ): Promise<BatchOperationResponse> {
    this.logger.log(
      `batchUnlock instanceIds=${JSON.stringify(instanceIds)} reason=${reason} userId=${userId}`,
    );

    let successCount: number = 0;
    let failedCount: number = 0;

    for (const instanceId of instanceIds) {
      try {
        validateUUID(instanceId, '实例ID');
        const instanceRows = await this.db
          .select()
          .from(assessmentInstance)
          .where(eq(assessmentInstance.id, instanceId))
          .limit(1);

        if (instanceRows.length === 0) {
          this.logger.warn(`batchUnlock: instance ${instanceId} not found`);
          failedCount++;
          continue;
        }

        const instance = instanceRows[0];
        let mapped: UnlockRule;
        try {
          mapped = getUnlockRule(instance.status);
        } catch {
          this.logger.warn(
            `batchUnlock: instance ${instanceId} status ${instance.status} not unlockable`,
          );
          failedCount++;
          continue;
        }

        if (mapped.resetRatingTypes?.length) {
          for (const ratingType of mapped.resetRatingTypes) {
            await this.db
              .update(ratingRecord)
              .set({
                isDraft: true,
                submittedAt: null,
              })
              .where(
                and(
                  eq(ratingRecord.instanceId, instanceId),
                  eq(ratingRecord.ratingType, ratingType),
                ),
              );
          }
        }

        const batchUpdateData = getUnlockUpdateData(mapped);

        await this.db
          .update(assessmentInstance)
          .set(batchUpdateData)
          .where(eq(assessmentInstance.id, instanceId));

        await this.db.insert(auditLog).values({
          operatorId: userId,
          action: 'unlock',
          targetType: 'assessment_instance',
          targetId: instanceId,
          reason,
          changes: { from: instance.status, to: mapped.newStatus },
        });

        successCount++;
      } catch (err) {
        this.logger.warn(
          `batchUnlock: failed for instance ${instanceId}: ${err}`,
        );
        failedCount++;
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
    };
  }

  async batchReturn(
    instanceIds: string[],
    userId: string,
  ): Promise<BatchOperationResponse> {
    this.logger.log(
      `batchReturn instanceIds=${JSON.stringify(instanceIds)} userId=${userId}`,
    );

    let successCount: number = 0;
    let failedCount: number = 0;

    for (const instanceId of instanceIds) {
      try {
        validateUUID(instanceId, '实例ID');

        await this.db.transaction(async (tx: any) => {
          const instanceRows = await tx
            .select()
            .from(assessmentInstance)
            .where(eq(assessmentInstance.id, instanceId))
            .for('update')
            .limit(1);

          if (instanceRows.length === 0) {
            throw new NotFoundException(`实例 ${instanceId} 不存在`);
          }

          const instance = instanceRows[0];

          // 仅允许退回 self_review 状态的实例（尚未开始评分）
          if (instance.status !== 'self_review') {
            throw new BadRequestException(
              `实例 ${instanceId} 状态为 ${instance.status}，仅支持退回自评中状态的绩效`,
            );
          }

          // 删除实例级指标快照
          await tx
            .delete(assessmentIndicatorSnapshot)
            .where(eq(assessmentIndicatorSnapshot.instanceId, instanceId));

          // 删除评分记录（自评阶段只有草稿）
          await tx
            .delete(ratingRecord)
            .where(eq(ratingRecord.instanceId, instanceId));

          // 删除实例
          await tx
            .delete(assessmentInstance)
            .where(eq(assessmentInstance.id, instanceId));

          // 记录审计日志
          await tx.insert(auditLog).values({
            operatorId: userId,
            action: 'return',
            targetType: 'assessment_instance',
            targetId: instanceId,
            changes: {
              employeeId: instance.employeeId,
              period: instance.period,
              fromStatus: instance.status,
            },
          });
        });

        successCount++;
      } catch (err) {
        this.logger.warn(
          `batchReturn: failed for instance ${instanceId}: ${err}`,
        );
        failedCount++;
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
    };
  }

  async batchResendNotification(
    instanceIds: string[],
    userId: string,
  ): Promise<BatchOperationResponse> {
    this.logger.log(
      `batchResendNotification instanceIds=${JSON.stringify(instanceIds)} userId=${userId}`,
    );

    let successCount: number = 0;
    let failedCount: number = 0;

    for (const instanceId of instanceIds) {
      try {
        const instanceRows = await this.db
          .select({
            employeeId: assessmentInstance.employeeId,
            period: assessmentInstance.period,
          })
          .from(assessmentInstance)
          .where(eq(assessmentInstance.id, instanceId))
          .limit(1);

        if (instanceRows.length === 0) {
          this.logger.warn(
            `batchResendNotification: instance ${instanceId} not found`,
          );
          failedCount++;
          continue;
        }

        const instance = instanceRows[0];
        const empId: string = instance.employeeId;
        const period: string = instance.period;

        await this.capabilityService
          .load('assessment_reminder_feishu_send_1')
          .call('send_feishu_message', {
            title: { title: '考核提醒通知' },
            receiverUserList: [empId],
            cardContentMarkdown: `**考核提醒通知**\n\n${period} 月度考核正在进行中，请尽快完成。`,
          });

        this.logger.log(
          `batchResendNotification: sent for instance ${instanceId} to employee ${empId}`,
        );
        successCount++;
      } catch (err) {
        this.logger.warn(
          `batchResendNotification: failed for instance ${instanceId}: ${err}`,
        );
        failedCount++;
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
    };
  }

  private async getEmployeeIdsForPeriod(period: string): Promise<string[]> {
    const rows = await this.db
      .select({ employeeId: employeeBinding.employeeId })
      .from(employeeBinding)
      .innerJoin(employee, eq(employeeBinding.employeeId, employee.employeeId))
      .where(
        and(
          eq(employeeBinding.status, true),
          lte(employeeBinding.effectiveFrom, period),
          isNull(employee.deletedAt),
          eq(employee.status, true),
        ),
      );

    return rows.map((r: (typeof rows)[number]) => r.employeeId);
  }
}

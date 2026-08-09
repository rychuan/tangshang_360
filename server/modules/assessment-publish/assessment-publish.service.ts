import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
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
  inArray,
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
} from '@server/database/schema';
import { EmployeeSnapshotService } from '../employee-snapshot/employee-snapshot.service';
import { UnlockService } from './unlock.service';
import { ReminderService } from './reminder.service';
import { getPublishedAssessmentStatuses } from './status';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { assertBatchSize, runWithConcurrency } from '@server/common/utils/batch';
import { validateUUID } from '@server/common/utils/validation';
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
  ReminderPreviewResponse,
  UnfinishedReminderRequest,
  UnfinishedReminderResponse,
  UnlockHistoryItem,
} from '@shared/api.interface';
import {
  buildPublishedNotificationMessages,
  buildReminderNotificationMessages,
  normalizeAppBaseUrl,
  summarizeReminderTargets,
  type AssessmentNotificationMessage,
} from '@server/common/assessment/notification';

export { getPublishedAssessmentStatuses } from './status';

export function normalizePublishExportIds(instanceIds: string[]): string[] {
  const uniqueIds = Array.from(new Set(instanceIds || []));
  if (uniqueIds.length > 1000) {
    throw new BadRequestException('单次最多导出 1000 条绩效记录');
  }
  return uniqueIds;
}

@Injectable()
export class AssessmentPublishService {
  private readonly logger: Logger = new Logger(AssessmentPublishService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly employeeSnapshotService: EmployeeSnapshotService,
    private readonly accessScopeService: AccessScopeService,
    private readonly unlockService: UnlockService,
    private readonly reminderService: ReminderService,
  ) {}

  private async buildPublishEmployeeScope(userId: string): Promise<SQL | null> {
    return this.accessScopeService.buildEmployeeScopeCondition(userId, {
      includeSelf: false,
    });
  }

  async listEmployees(
    periods: string[],
    department: string,
    templateId: string,
    userId: string,
  ): Promise<{ items: PublishEmployeeItem[] }> {
    this.logger.log(
      `listEmployees periods=${JSON.stringify(periods)} department=${department} templateId=${templateId}`,
    );
    if (!periods || periods.length === 0) {
      return { items: [] };
    }
    const latestPeriod = periods[0]; // periods are sorted desc
    const conditions: SQL[] = [
      eq(employeeBinding.status, true),
      lte(employeeBinding.effectiveFrom, latestPeriod),
      isNull(employee.deletedAt),
      eq(employee.status, true),
      eq(assessmentTemplate.isActive, true),
      periods.length === 1
        ? sql`NOT EXISTS (SELECT 1 FROM ${assessmentInstance} WHERE (${assessmentInstance.employeeId}).user_id = (${employeeBinding.employeeId}).user_id AND ${assessmentInstance.period} = ${periods[0]})`
        : sql`NOT EXISTS (SELECT 1 FROM ${assessmentInstance} WHERE (${assessmentInstance.employeeId}).user_id = (${employeeBinding.employeeId}).user_id AND ${assessmentInstance.period} IN (${sql.join(
            periods.map((p: string) => sql`${p}`),
            sql`,`,
          )}) )`,
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
    const appBaseUrl = normalizeAppBaseUrl(body.appBaseUrl);
    this.logger.log(
      `publish period=${period} employeeIds=${JSON.stringify(employeeIds)}`,
    );

    const hasExplicitTargets = Boolean(employeeIds && employeeIds.length > 0);
    const targetEmployeeIds: string[] = hasExplicitTargets
      ? employeeIds!
      : await this.getEmployeeIdsForPeriod(period, userId);
    if (hasExplicitTargets) {
      await this.assertEmployeeScopes(userId, targetEmployeeIds);
    }

    if (targetEmployeeIds.length === 0) {
      throw new BadRequestException('没有符合条件的员工可发布');
    }

    const publishedAt: Date = new Date();

    const validation = await this.validatePublishTargets(
      targetEmployeeIds,
      period,
    );

    let publishedCount = 0;
    const publishedInstances: Array<{
      employeeId: string;
      instanceId: string;
      employeeName: string;
      supervisorId?: string;
      period: string;
      status: string;
    }> = [];

    for (const empId of validation.validIds) {
      const info = validation.employeeMap.get(empId)!;

      await this.db.transaction(async (tx) => {
        const [instance] = await tx
          .insert(assessmentInstance)
          .values({
            period,
            employeeId: empId,
            supervisorId: info.supervisorId,
            position: info.position,
            templateId: info.templateId,
            status: 'self_review',
            publishedBy: userId,
            publishedAt,
          })
          .returning({ id: assessmentInstance.id });

        const instanceId: string = instance.id;

        const hasSnap = await this.employeeSnapshotService.hasSnapshot(
          empId,
          tx,
        );
        if (hasSnap) {
          await this.employeeSnapshotService.copyToInstance(
            empId,
            instanceId,
            tx,
          );
        } else {
          await this.employeeSnapshotService.generateFromTemplate(
            empId,
            info.templateId,
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
          changes: { period, employeeId: empId, templateId: info.templateId },
        });

        publishedCount++;
        publishedInstances.push({
          employeeId: empId,
          instanceId,
          employeeName: info.employeeName,
          supervisorId: info.supervisorId ?? undefined,
          period,
          status: 'self_review',
        });
      });
    }

    if (publishedInstances.length > 0) {
      const messages = publishedInstances.flatMap((instance) =>
        buildPublishedNotificationMessages({
          ...instance,
          appBaseUrl,
        }),
      );
      void this.reminderService.sendNotificationMessages(messages).then(
        (result) => {
          this.logger.log(
            `Published notifications completed: sent=${result.sentCount}, failed=${result.failedCount}`,
          );
        },
      );
    }

    return { success: true, publishedCount };
  }

  /** 批量预校验发布目标 — 一次数据库往返替代 5N 次串行查询 */
  private async validatePublishTargets(
    employeeIds: string[],
    period: string,
  ): Promise<{
    validIds: string[];
    employeeMap: Map<
      string,
      {
        employeeName: string;
        position: string;
        supervisorId: string | null;
        templateId: string;
      }
    >;
  }> {
    const existingInstances = await this.db
      .select({ employeeId: assessmentInstance.employeeId })
      .from(assessmentInstance)
      .where(
        and(
          inArray(assessmentInstance.employeeId, employeeIds),
          eq(assessmentInstance.period, period),
        ),
      );
    const duplicateIds = new Set(existingInstances.map((r) => r.employeeId));

    const bindings = await this.db
      .select({
        employeeId: employeeBinding.employeeId,
        templateId: employeeBinding.templateId,
      })
      .from(employeeBinding)
      .where(
        and(
          inArray(employeeBinding.employeeId, employeeIds),
          eq(employeeBinding.status, true),
          lte(employeeBinding.effectiveFrom, period),
        ),
      );
    const bindingMap = new Map(
      bindings.map((b) => [b.employeeId, b.templateId]),
    );

    const templateIds = [...new Set(bindings.map((b) => b.templateId))];
    const templates = await this.db
      .select({
        id: assessmentTemplate.id,
        isActive: assessmentTemplate.isActive,
      })
      .from(assessmentTemplate)
      .where(inArray(assessmentTemplate.id, templateIds));
    const templateMap = new Map(templates.map((t) => [t.id, t.isActive]));

    const indicatorCounts = await this.db
      .select({
        templateId: assessmentDimension.templateId,
        cnt: sql<number>`count(${assessmentIndicator.id})::int`,
      })
      .from(assessmentDimension)
      .innerJoin(
        assessmentIndicator,
        eq(assessmentIndicator.dimensionId, assessmentDimension.id),
      )
      .where(inArray(assessmentDimension.templateId, templateIds))
      .groupBy(assessmentDimension.templateId);
    const indicatorCountMap = new Map(
      indicatorCounts.map((r) => [r.templateId, r.cnt]),
    );

    const employees = await this.db
      .select()
      .from(employee)
      .where(
        and(
          inArray(employee.employeeId, employeeIds),
          isNull(employee.deletedAt),
        ),
      );
    const employeeMap = new Map(employees.map((e) => [e.employeeId, e]));

    const validIds: string[] = [];
    const resultMap = new Map<
      string,
      {
        employeeName: string;
        position: string;
        supervisorId: string | null;
        templateId: string;
      }
    >();

    for (const empId of employeeIds) {
      if (duplicateIds.has(empId)) {
        this.logger.log(
          `skip ${empId}: already has instance for period ${period}`,
        );
        continue;
      }

      const templateId = bindingMap.get(empId);
      if (!templateId) {
        this.logger.log(`skip ${empId}: no active binding`);
        continue;
      }

      if (!templateMap.get(templateId)) {
        this.logger.log(
          `skip ${empId}: template ${templateId} not found or inactive`,
        );
        continue;
      }

      if (
        !indicatorCountMap.has(templateId) ||
        Number(indicatorCountMap.get(templateId)) === 0
      ) {
        throw new BadRequestException(
          `模板 ${templateId} 没有配置考核指标，无法发布员工 ${empId}`,
        );
      }

      const emp = employeeMap.get(empId);
      if (!emp) {
        this.logger.log(`skip ${empId}: employee not found`);
        continue;
      }

      if (!emp.status) {
        this.logger.warn(`skip ${empId}: employee inactive`);
        continue;
      }

      if (!emp.supervisorId) {
        this.logger.warn(`employee ${empId} has no supervisor`);
      }

      validIds.push(empId);
      resultMap.set(empId, {
        employeeName: emp.name,
        position: emp.position,
        supervisorId: emp.supervisorId,
        templateId,
      });
    }

    return { validIds, employeeMap: resultMap };
  }

  async listInstances(
    periods: string[],
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

    if (!periods || periods.length === 0) {
      return { items: [], total: 0 };
    }
    const conditions: SQL[] = [
      periods.length === 1
        ? eq(assessmentInstance.period, periods[0])
        : inArray(assessmentInstance.period, periods),
      isNull(employee.deletedAt),
    ];
    if (status) {
      const statuses = getPublishedAssessmentStatuses(status);
      conditions.push(
        statuses.length === 1
          ? eq(assessmentInstance.status, statuses[0])
          : inArray(assessmentInstance.status, statuses),
      );
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
      .innerJoin(
        employee,
        eq(assessmentInstance.employeeId, employee.employeeId),
      )
      .where(and(...conditions));

    const total: number = parseInt(String(totalResult[0]?.count ?? '0'), 10);

    const items = await this.selectInstanceItems(conditions, ps, offset);

    return { items, total };
  }

  async exportInstances(
    requestedIds: string[],
    userId: string,
  ): Promise<{ items: AssessmentInstanceItem[] }> {
    const instanceIds = normalizePublishExportIds(requestedIds);
    if (instanceIds.length === 0) {
      return { items: [] };
    }
    for (const id of instanceIds) {
      validateUUID(id);
    }
    await this.assertInstanceScopes(userId, instanceIds);

    const conditions: SQL[] = [
      inArray(assessmentInstance.id, instanceIds),
      isNull(employee.deletedAt),
    ];
    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    const items = await this.selectInstanceItems(
      conditions,
      instanceIds.length,
      0,
    );
    return { items };
  }

  private async selectInstanceItems(
    conditions: SQL[],
    limit: number,
    offset: number,
  ): Promise<AssessmentInstanceItem[]> {
    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
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
        supervisorName: sql<string>`COALESCE((SELECT sup.name FROM employee sup WHERE (sup.employee_id).user_id = (${assessmentInstance.supervisorId}).user_id AND sup.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        eq(assessmentInstance.employeeId, employee.employeeId),
      )
      .where(and(...conditions))
      .orderBy(desc(assessmentInstance.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      period: row.period,
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
    }));
  }

  async getEmployeeSnapshot(
    employeeId: string,
    userId: string,
  ): Promise<EmployeeSnapshotResponse> {
    await this.assertEmployeeScope(userId, employeeId);
    return this.employeeSnapshotService.getSnapshot(employeeId);
  }

  async adjustEmployeeSnapshot(
    employeeId: string,
    body: AdjustRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    this.logger.log(`adjustEmployeeSnapshot employeeId=${employeeId}`);
    await this.assertEmployeeScope(userId, employeeId);

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
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.assertEmployeeScope(userId, employeeId);
    return this.employeeSnapshotService.deleteSnapshot(employeeId);
  }

  async unlock(
    instanceId: string,
    body: UnlockRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    return this.unlockService.unlock(instanceId, body, userId);
  }

  async getUnlockHistory(
    instanceId: string,
    userId: string,
  ): Promise<UnlockHistoryItem[]> {
    return this.unlockService.getUnlockHistory(instanceId, userId);
  }

  async getPeriodStatistics(
    periods: string[],
    userId: string,
  ): Promise<PeriodStatisticsResponse> {
    this.logger.log(`getPeriodStatistics periods=${JSON.stringify(periods)}`);

    if (!periods || periods.length === 0) {
      return {
        toPublishCount: 0,
        publishedCount: 0,
        selfReviewCompletedRate: 0,
        pendingCount: 0,
      };
    }

    const latestPeriod = periods[0]; // periods are sorted desc
    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    const bindingConditions: SQL[] = [
      eq(employeeBinding.status, true),
      lte(employeeBinding.effectiveFrom, latestPeriod),
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
      periods.length === 1
        ? eq(assessmentInstance.period, periods[0])
        : inArray(assessmentInstance.period, periods),
      isNull(employee.deletedAt),
    ];
    if (scopeCondition) {
      instanceConditions.push(scopeCondition);
    }

    const publishedCountResult = await this.db
      .select({ count: count() })
      .from(assessmentInstance)
      .innerJoin(
        employee,
        eq(assessmentInstance.employeeId, employee.employeeId),
      )
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
      .innerJoin(
        employee,
        eq(assessmentInstance.employeeId, employee.employeeId),
      )
      .where(
        and(...instanceConditions, ne(assessmentInstance.status, 'completed')),
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
    userId: string,
  ): Promise<InstanceIndicatorsResponse> {
    validateUUID(instanceId);
    await this.assertInstanceScope(userId, instanceId);
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
    return this.unlockService.batchUnlock(instanceIds, reason, userId);
  }

  async batchReturn(
    instanceIds: string[],
    userId: string,
  ): Promise<BatchOperationResponse> {
    assertBatchSize(instanceIds, '实例');
    for (const instanceId of instanceIds) {
      validateUUID(instanceId, '实例ID');
    }
    this.logger.log(
      `batchReturn instanceIds=${JSON.stringify(instanceIds)} userId=${userId}`,
    );

    const uniqueIds = [...new Set(instanceIds)];

    // 批量获取所有实例信息（一次查询代替 N 次 SELECT）
    const instances = await this.db
      .select({
        id: assessmentInstance.id,
        employeeId: assessmentInstance.employeeId,
        period: assessmentInstance.period,
        status: assessmentInstance.status,
      })
      .from(assessmentInstance)
      .where(inArray(assessmentInstance.id, uniqueIds));

    const instanceMap = new Map(instances.map((i) => [i.id, i]));

    // 批量预校验：实例存在 + 状态
    const validIds: string[] = [];
    let preCheckFailedCount = 0;

    for (const instanceId of uniqueIds) {
      const inst = instanceMap.get(instanceId);
      if (!inst) {
        this.logger.warn(`batchReturn: instance ${instanceId} not found`);
        preCheckFailedCount++;
        continue;
      }
      if (inst.status !== 'self_review') {
        this.logger.warn(
          `batchReturn: instance ${instanceId} status=${inst.status}, skip`,
        );
        preCheckFailedCount++;
        continue;
      }
      validIds.push(instanceId);
    }

    if (validIds.length === 0) {
      return {
        success: false,
        successCount: 0,
        failedCount: preCheckFailedCount,
      };
    }

    // 批量权限校验（并行，移出事务减少锁持有时间）
    const scopeCheckFailed = new Set<string>();
    await Promise.all(
      validIds.map(async (instanceId) => {
        const inst = instanceMap.get(instanceId)!;
        try {
          const canAccess = await this.accessScopeService.canAccessEmployee(
            userId,
            inst.employeeId,
            { includeSelf: false },
          );
          if (!canAccess) {
            scopeCheckFailed.add(instanceId);
          }
        } catch {
          scopeCheckFailed.add(instanceId);
        }
      }),
    );

    const processIds = validIds.filter((id) => !scopeCheckFailed.has(id));
    preCheckFailedCount += scopeCheckFailed.size;

    // 并行处理退回（每个实例独立事务，无死锁风险）
    const concurrency = 10;
    const results = await runWithConcurrency(
      processIds,
      concurrency,
      async (instanceId) => {
        try {
          const inst = instanceMap.get(instanceId)!;
          await this.db.transaction(async (tx) => {
            // 锁行防止并发修改
            await tx
              .select()
              .from(assessmentInstance)
              .where(eq(assessmentInstance.id, instanceId))
              .for('update')
              .limit(1);

            await tx
              .delete(assessmentIndicatorSnapshot)
              .where(eq(assessmentIndicatorSnapshot.instanceId, instanceId));
            await tx
              .delete(ratingRecord)
              .where(eq(ratingRecord.instanceId, instanceId));
            await tx
              .delete(assessmentInstance)
              .where(eq(assessmentInstance.id, instanceId));
            await tx.insert(auditLog).values({
              operatorId: userId,
              action: 'return',
              targetType: 'assessment_instance',
              targetId: instanceId,
              changes: {
                employeeId: inst.employeeId,
                period: inst.period,
                fromStatus: inst.status,
              },
            });
          });
          return true;
        } catch (err) {
          this.logger.warn(
            `batchReturn: failed for instance ${instanceId}: ${err}`,
          );
          return false;
        }
      },
    );

    const successCount = results.filter(Boolean).length;
    const failedCount = results.length - successCount + preCheckFailedCount;

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
    };
  }

  /** 未完成考核提醒（委托 ReminderService） */
  async previewUnfinishedReminders(
    periods: string[],
    department: string,
    status: string,
    grade: string,
    userId: string,
  ): Promise<ReminderPreviewResponse> {
    return this.reminderService.previewUnfinishedReminders(
      periods,
      department,
      status,
      grade,
      userId,
    );
  }

  async remindUnfinishedAssessments(
    body: UnfinishedReminderRequest,
    userId: string,
  ): Promise<UnfinishedReminderResponse> {
    return this.reminderService.remindUnfinishedAssessments(body, userId);
  }


  private async getEmployeeIdsForPeriod(
    period: string,
    userId: string,
  ): Promise<string[]> {
    const conditions: SQL[] = [
      eq(employeeBinding.status, true),
      lte(employeeBinding.effectiveFrom, period),
      isNull(employee.deletedAt),
      eq(employee.status, true),
    ];
    const scopeCondition = await this.buildPublishEmployeeScope(userId);
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    const rows = await this.db
      .select({ employeeId: employeeBinding.employeeId })
      .from(employeeBinding)
      .innerJoin(employee, eq(employeeBinding.employeeId, employee.employeeId))
      .where(and(...conditions));

    return rows.map((r: (typeof rows)[number]) => r.employeeId);
  }

  private async assertEmployeeScopes(
    userId: string,
    employeeIds: string[],
  ): Promise<void> {
    for (const employeeId of new Set(employeeIds)) {
      await this.assertEmployeeScope(userId, employeeId);
    }
  }

  private async assertEmployeeScope(
    userId: string,
    employeeId: string,
  ): Promise<void> {
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      employeeId,
      { includeSelf: false },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权操作该员工');
    }
  }

  private async assertInstanceScopes(
    userId: string,
    instanceIds: string[],
  ): Promise<void> {
    for (const instanceId of new Set(instanceIds)) {
      await this.assertInstanceScope(userId, instanceId);
    }
  }

  private async assertInstanceScope(
    userId: string,
    instanceId: string,
  ): Promise<void> {
    const rows = await this.db
      .select({ employeeId: assessmentInstance.employeeId })
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, instanceId))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException(`实例 ${instanceId} 不存在`);
    }
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      rows[0].employeeId,
      { includeSelf: false },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权操作该考核实例');
    }
  }
}

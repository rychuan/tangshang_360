import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import {
  assessmentInstance,
  ratingRecord,
  auditLog,
  employee,
} from '@server/database/schema';
import { validateUUID } from '@server/common/utils/validation';
import { assertBatchSize } from '@server/common/utils/batch';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import type {
  UnlockRequest,
  BatchOperationResponse,
  UnlockHistoryItem,
} from '@shared/api.interface';

// ============================================================
// Unlock 规则配置
// ============================================================

export type UnlockRule = {
  newStatus: string;
  resetRatingTypes?: string[];
  draftRatingTypes?: string[];
  clearSigns?: 'all' | 'self' | 'supervisor';
  clearScore?: boolean;
};

const UNLOCK_RULES: Record<string, UnlockRule> = {
  completed: {
    newStatus: 'supervisor_review',
    resetRatingTypes: ['supervisor'],
    clearSigns: 'supervisor',
  },
  supervisor_sign: {
    newStatus: 'supervisor_review',
    resetRatingTypes: ['supervisor'],
    clearSigns: 'supervisor',
  },
  supervisor_review: {
    newStatus: 'self_review',
    clearSigns: 'self',
    draftRatingTypes: ['self'],
  },
  pending_sign: {
    newStatus: 'self_review',
    clearSigns: 'self',
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

export function getUnlockUpdateData(rule: UnlockRule): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    status: rule.newStatus,
    completedAt: null,
  };
  if (rule.clearScore !== false) {
    updateData.totalScore = null;
    updateData.grade = null;
  }
  if (rule.clearSigns === 'all' || rule.clearSigns === 'self') {
    updateData.selfSignName = null;
    updateData.selfSignAt = null;
    updateData.selfSignImage = null;
  }
  if (rule.clearSigns === 'all' || rule.clearSigns === 'supervisor') {
    updateData.supervisorSignName = null;
    updateData.supervisorSignAt = null;
    updateData.supervisorSignImage = null;
  }
  return updateData;
}

// ============================================================
// UnlockService
// ============================================================

@Injectable()
export class UnlockService {
  private readonly logger = new Logger(UnlockService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async unlockInstanceInTransaction(
    instanceId: string,
    reason: string | undefined,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const instanceRows = await tx
        .select()
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, instanceId))
        .for('update')
        .limit(1);

      if (instanceRows.length === 0) {
        throw new NotFoundException('考核实例不存在');
      }

      const instance = instanceRows[0];
      const mapped = getUnlockRule(instance.status);
      const ratingTypesToDraft = [
        ...(mapped.resetRatingTypes ?? []),
        ...(mapped.draftRatingTypes ?? []),
      ];

      for (const ratingType of ratingTypesToDraft) {
        await tx
          .update(ratingRecord)
          .set({ isDraft: true, submittedAt: null })
          .where(
            and(
              eq(ratingRecord.instanceId, instanceId),
              eq(ratingRecord.ratingType, ratingType),
            ),
          );
      }

      await tx
        .update(assessmentInstance)
        .set(getUnlockUpdateData(mapped))
        .where(eq(assessmentInstance.id, instanceId));

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'unlock',
        targetType: 'assessment_instance',
        targetId: instanceId,
        reason,
        changes: { from: instance.status, to: mapped.newStatus },
      });
    });
  }

  async unlock(
    instanceId: string,
    body: UnlockRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    validateUUID(instanceId);
    await this.assertInstanceScope(userId, instanceId);
    this.logger.log(
      `unlock instanceId=${instanceId} reason=${body.reason} userId=${userId}`,
    );
    await this.unlockInstanceInTransaction(instanceId, body.reason, userId);
    return { success: true };
  }

  async getUnlockHistory(
    instanceId: string,
    userId: string,
  ): Promise<UnlockHistoryItem[]> {
    validateUUID(instanceId);
    await this.assertInstanceScope(userId, instanceId);
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

    return rows.map((row: any): UnlockHistoryItem => {
      const changes = (row.changes as { from?: string; to?: string }) ?? {};
      return {
        id: row.id,
        operatorName: row.operatorName ?? '未知',
        fromStatus: changes.from ?? '',
        toStatus: changes.to ?? '',
        reason: row.reason ?? '',
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
      };
    });
  }

  async batchUnlock(
    instanceIds: string[],
    reason: string,
    userId: string,
  ): Promise<BatchOperationResponse> {
    assertBatchSize(instanceIds, '实例');
    for (const instanceId of instanceIds) {
      validateUUID(instanceId, '实例ID');
    }
    await this.assertInstanceScopes(userId, instanceIds);
    this.logger.log(
      `batchUnlock instanceIds=${JSON.stringify(instanceIds)} reason=${reason} userId=${userId}`,
    );

    const uniqueIds = [...new Set(instanceIds)];
    const concurrency = 10;
    const results: boolean[] = [];

    // 分批并行处理
    for (let i = 0; i < uniqueIds.length; i += concurrency) {
      const batch = uniqueIds.slice(i, i + concurrency);
      results.push(
        ...(await Promise.all(
          batch.map(async (instanceId) => {
            try {
              await this.unlockInstanceInTransaction(
                instanceId,
                reason,
                userId,
              );
              return true;
            } catch (err) {
              this.logger.warn(
                `batchUnlock: failed for instance ${instanceId}: ${err}`,
              );
              return false;
            }
          }),
        )),
      );
    }

    const successCount = results.filter(Boolean).length;
    const failedCount = results.length - successCount;

    return { success: failedCount === 0, successCount, failedCount };
  }

  private async assertInstanceScopes(
    userId: string,
    instanceIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(instanceIds)];
    if (uniqueIds.length === 0) return;

    const rows = await this.db
      .select({
        id: assessmentInstance.id,
        employeeId: assessmentInstance.employeeId,
      })
      .from(assessmentInstance)
      .where(inArray(assessmentInstance.id, uniqueIds));
    const employeeByInstanceId = new Map(
      rows.map((row) => [row.id, row.employeeId]),
    );

    for (const instanceId of uniqueIds) {
      const employeeId = employeeByInstanceId.get(instanceId);
      if (!employeeId) {
        throw new NotFoundException(`实例 ${instanceId} 不存在`);
      }
      await this.assertEmployeeScope(userId, employeeId);
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
      throw new NotFoundException('考核实例不存在');
    }
    await this.assertEmployeeScope(userId, rows[0].employeeId);
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
      throw new ForbiddenException('无权操作该考核实例');
    }
  }
}

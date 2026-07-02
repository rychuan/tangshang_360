import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, sql } from 'drizzle-orm';
import { assessmentInstance, employee, auditLog } from '@server/database/schema';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

const PLUGIN_INSTANCE_ID = 'performance_template_sync_feishu_multitable_crud_analysis_2';

interface PerformanceBitableRecord {
  id: string;
  record: {
    '员工'?: number[];
    '绩效周期'?: { text: string };
    '岗位'?: string;
    '部门'?: string;
    '上级'?: number[];
    '状态'?: string;
    '总分'?: number;
    '等级'?: string;
    '完成时间'?: { text: string };
  };
}

interface SearchResult {
  records: PerformanceBitableRecord[];
  hasMore: boolean;
  pageToken?: string;
}

interface BatchResult {
  records: { id: string }[];
}

function asSearchResult(val: unknown): SearchResult {
  return val as SearchResult;
}

function asBatchResult(val: unknown): BatchResult {
  return val as BatchResult;
}

@Injectable()
export class PerformanceSyncService {
  private readonly logger = new Logger(PerformanceSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
  ) {}

  async exportToBitable(): Promise<BitablePluginSyncResponse> {
    const instances = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        employeeUserId: sql<string>`(${assessmentInstance.employeeId}).user_id`,
        supervisorUserId: sql<string>`COALESCE((${assessmentInstance.supervisorId}).user_id, '')`,
        position: assessmentInstance.position,
        totalScore: assessmentInstance.totalScore,
        grade: assessmentInstance.grade,
        status: assessmentInstance.status,
        completedAt: assessmentInstance.completedAt,
        department: employee.department,
      })
      .from(assessmentInstance)
      .leftJoin(
        employee,
        sql`(${assessmentInstance.employeeId}).user_id = (${employee.id}).user_id`,
      );

    const bitableRecordByKey = new Map<string, string>();
    let pageToken: string | undefined;
    do {
      const result = asSearchResult(
        await this.capabilityService
          .load(PLUGIN_INSTANCE_ID)
          .call('searchRecords', { pageSize: 500, pageToken }),
      );
      for (const item of result.records) {
        const userIds = item.record['员工'];
        const periodText = item.record['绩效周期']?.text || '';
        if (Array.isArray(userIds) && userIds.length > 0 && periodText) {
          bitableRecordByKey.set(`${userIds[0]}_${periodText}`, item.id);
        }
      }
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const toUpdate: Array<{
      id: string;
      record: Record<string, unknown>;
    }> = [];
    const toCreate: Array<{ record: Record<string, unknown> }> = [];

    for (const inst of instances) {
      if (!inst.employeeUserId) continue;
      const numericUserId = Number(inst.employeeUserId);
      if (Number.isNaN(numericUserId)) continue;

      const supervisorNum = inst.supervisorUserId
        ? Number(inst.supervisorUserId)
        : NaN;
      const totalScore = inst.totalScore ? Number(inst.totalScore) : 0;
      const completedAtStr = inst.completedAt
        ? new Date(inst.completedAt as Date | string).toISOString()
        : '';

      const record: Record<string, unknown> = {
        员工: [numericUserId],
        绩效周期: inst.period,
        岗位: inst.position || '',
        部门: inst.department || '',
        上级: Number.isNaN(supervisorNum) ? [] : [supervisorNum],
        状态: inst.status || '',
        总分: totalScore,
        等级: inst.grade || '',
        完成时间: completedAtStr,
      };

      const key = `${numericUserId}_${inst.period}`;
      const existingRecordId = bitableRecordByKey.get(key);

      if (existingRecordId) {
        toUpdate.push({ id: existingRecordId, record });
      } else {
        toCreate.push({ record });
      }
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < toCreate.length; i += 500) {
      const batch = toCreate.slice(i, i + 500);
      try {
        const result = asBatchResult(
          await this.capabilityService
            .load(PLUGIN_INSTANCE_ID)
            .call('batchAddRecords', { records: batch }),
        );
        created += result.records.length;
      } catch (err) {
        failed += batch.length;
        this.logger.error(
          `batchAddRecords failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (let i = 0; i < toUpdate.length; i += 500) {
      const batch = toUpdate.slice(i, i + 500);
      try {
        const result = asBatchResult(
          await this.capabilityService
            .load(PLUGIN_INSTANCE_ID)
            .call('batchUpdateRecords', { records: batch }),
        );
        updated += result.records.length;
      } catch (err) {
        failed += batch.length;
        this.logger.error(
          `batchUpdateRecords failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.db.insert(auditLog).values({
      action: 'export_performance_to_bitable',
      targetType: 'bitable_sync',
      targetId: PLUGIN_INSTANCE_ID,
      changes: { total: instances.length, created, updated, failed },
    });

    return {
      total: instances.length,
      created,
      updated,
      skipped: 0,
      failed,
      message: `导出完成：新增 ${created} 条，更新 ${updated} 条，失败 ${failed} 条`,
    };
  }

  async importFromBitable(): Promise<BitablePluginSyncResponse> {
    const allRecords: PerformanceBitableRecord[] = [];
    let pageToken: string | undefined;
    do {
      const result = asSearchResult(
        await this.capabilityService
          .load(PLUGIN_INSTANCE_ID)
          .call('searchRecords', { pageSize: 500, pageToken }),
      );
      allRecords.push(...result.records);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of allRecords) {
      try {
        const userIds = item.record['员工'];
        const period = item.record['绩效周期']?.text || '';
        if (!Array.isArray(userIds) || userIds.length === 0 || !period) {
          skipped++;
          continue;
        }

        const userId = String(userIds[0]);

        const rows = await this.db
          .select()
          .from(assessmentInstance)
          .where(
            and(
              sql`(${assessmentInstance.employeeId}).user_id = ${userId}`,
              eq(assessmentInstance.period, period),
            ),
          )
          .limit(1);

        if (rows.length === 0) {
          skipped++;
          continue;
        }

        const existing = rows[0];
        const updateData: Record<string, unknown> = {};

        if (item.record['状态']) updateData.status = item.record['状态'];
        if (item.record['等级']) updateData.grade = item.record['等级'];
        if (item.record['总分'] != null)
          updateData.totalScore = String(item.record['总分']);
        if (item.record['岗位']) updateData.position = item.record['岗位'];

        const completedText = item.record['完成时间']?.text;
        if (completedText) {
          const completedDate = new Date(completedText);
          if (!isNaN(completedDate.getTime())) {
            updateData.completedAt = completedDate;
          }
        }

        if (Object.keys(updateData).length > 0) {
          await this.db
            .update(assessmentInstance)
            .set(updateData)
            .where(eq(assessmentInstance.id, existing.id));
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to process performance bitable record ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.db.insert(auditLog).values({
      action: 'import_performance_from_bitable',
      targetType: 'bitable_sync',
      targetId: PLUGIN_INSTANCE_ID,
      changes: { total: allRecords.length, updated, skipped, failed },
    });

    return {
      total: allRecords.length,
      created: 0,
      updated,
      skipped,
      failed,
      message: `导入完成：更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
    };
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { sql } from 'drizzle-orm';
import { assessmentInstance, employee, auditLog } from '@server/database/schema';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

const PLUGIN_INSTANCE_ID = 'performance_template_sync_feishu_multitable_crud_analysis_2';

interface PerformanceBitableRecord {
  id: string;
  record: {
    ID?: { text: string };
    员工?: number[];
    绩效周期?: { text: string };
    岗位?: string;
    部门?: string;
    上级?: number[];
    状态?: string;
    总分?: number;
    等级?: string;
    完成时间?: { text: string };
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

    const bitableRecordById = new Map<string, string>();
    let pageToken: string | undefined;
    do {
      const result = asSearchResult(
        await this.capabilityService
          .load(PLUGIN_INSTANCE_ID)
          .call('searchRecords', { pageSize: 500, pageToken }),
      );
      for (const item of result.records) {
        const idText = item.record['ID']?.text || '';
        if (idText) {
          bitableRecordById.set(idText, item.id);
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
        ID: inst.id,
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

      const existingRecordId = bitableRecordById.get(inst.id);

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
}

import {
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { employee } from '@server/database/schema';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

const PLUGIN_INSTANCE_ID = 'management_feishu_multitable_crud_analysis_1';

interface BitableRecord {
  id: string;
  record: {
    '姓名'?: number[];
    '编号'?: { text: string };
    '岗位'?: { text: string } | string;
    '部门'?: string;
    '角色'?: string;
    '状态'?: string;
    '上级'?: number[];
  };
}

interface SearchResult {
  records: BitableRecord[];
  hasMore: boolean;
  pageToken?: string;
}

interface BatchResult {
  records: { id: string }[];
}

function getTextValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'text' in val) {
    return String((val as { text: unknown }).text);
  }
  return '';
}

function asSearchResult(val: unknown): SearchResult {
  return val as SearchResult;
}

function asBatchResult(val: unknown): BatchResult {
  return val as BatchResult;
}

@Injectable()
export class BitableSyncService {
  private readonly logger = new Logger(BitableSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
  ) {}

  async importFromBitable(): Promise<BitablePluginSyncResponse> {
    const allRecords: BitableRecord[] = [];
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
        const userIds = item.record['姓名'];
        const employeeNo = item.record['编号']?.text || '';
        const position = getTextValue(item.record['岗位']);
        const department = item.record['部门'] || '';
        const role = item.record['角色'] || '';
        const status = item.record['状态'] || '';
        const supervisorIds = item.record['上级'];
        const supervisorId =
          Array.isArray(supervisorIds) && supervisorIds.length > 0
            ? String(supervisorIds[0])
            : '';

        const sudaUserId =
          Array.isArray(userIds) && userIds.length > 0
            ? String(userIds[0])
            : '';

        if (!sudaUserId && !employeeNo) {
          skipped++;
          continue;
        }

        let existing: typeof employee.$inferSelect | null = null;

        if (sudaUserId) {
          const rows = await this.db
            .select()
            .from(employee)
            .where(
              and(
                sql`(id).user_id = ${sudaUserId}`,
                isNull(employee.deletedAt),
              ),
            )
            .limit(1);
          if (rows.length > 0) existing = rows[0];
        }

        if (!existing && employeeNo) {
          const rows = await this.db
            .select()
            .from(employee)
            .where(
              and(
                eq(employee.employeeNo, employeeNo),
                isNull(employee.deletedAt),
              ),
            )
            .limit(1);
          if (rows.length > 0) existing = rows[0];
        }

        if (!existing) {
          skipped++;
          continue;
        }

        const updateData: Partial<typeof employee.$inferSelect> = {};
        if (position) updateData.position = position;
        if (department) updateData.department = department;
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (employeeNo) updateData.employeeNo = employeeNo;
        if (supervisorId) {
          updateData.supervisorId = supervisorId;
        } else if (existing.supervisorId) {
          updateData.supervisorId = null;
        }

        if (Object.keys(updateData).length > 0) {
          await this.db
            .update(employee)
            .set(updateData)
            .where(sql`(id).user_id = ${existing.id}`);
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to process bitable record ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      total: allRecords.length,
      created: 0,
      updated,
      skipped,
      failed,
      message: `导入完成：更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
    };
  }

  async exportToBitable(): Promise<BitablePluginSyncResponse> {
    const employees = await this.db
      .select()
      .from(employee)
      .where(isNull(employee.deletedAt));

    const bitableRecordByEmpNo = new Map<string, string>();
    const bitableRecordByUserId = new Map<string, string>();
    let pageToken: string | undefined;
    do {
      const result = asSearchResult(
        await this.capabilityService
          .load(PLUGIN_INSTANCE_ID)
          .call('searchRecords', { pageSize: 500, pageToken }),
      );
      for (const item of result.records) {
        const empNo = item.record['编号']?.text || '';
        if (empNo) {
          bitableRecordByEmpNo.set(empNo, item.id);
        }
        const userIds = item.record['姓名'];
        if (Array.isArray(userIds) && userIds.length > 0) {
          bitableRecordByUserId.set(String(userIds[0]), item.id);
        }
      }
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    const toUpdate: Array<{
      id: string;
      record: Record<string, unknown>;
    }> = [];
    const toCreate: Array<{ record: Record<string, unknown> }> = [];

    for (const emp of employees) {
      const numericId = Number(emp.id);
      if (Number.isNaN(numericId)) continue;

      const record: Record<string, unknown> = {
        姓名: [numericId],
        编号: emp.employeeNo || '',
        岗位: emp.position || '',
        部门: emp.department || '',
        角色: emp.role || '',
        状态: emp.status || '',
        上级: emp.supervisorId
          ? [Number(emp.supervisorId)]
          : [],
      };

      const existingRecordId =
        bitableRecordByUserId.get(emp.id) ??
        (emp.employeeNo
          ? bitableRecordByEmpNo.get(emp.employeeNo)
          : undefined);

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

    const skipped = employees.length - created - updated - failed;

    return {
      total: employees.length,
      created,
      updated,
      skipped: skipped >= 0 ? skipped : 0,
      failed,
      message: `导出完成：新增 ${created} 条，更新 ${updated} 条，失败 ${failed} 条`,
    };
  }
}

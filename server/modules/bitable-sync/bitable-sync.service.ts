import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, isNull, isNotNull, sql, inArray } from 'drizzle-orm';
import { employee, auditLog } from '@server/database/schema';
import { RoleManagerService } from '../role-manager/role-manager.service';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

const PLUGIN_INSTANCE_ID = 'management_feishu_multitable_crud_analysis_1';

interface BitableRecord {
  id: string;
  record: {
    姓名?: number[];
    编号?: { text: string };
    岗位?: string;
    部门?: string;
    角色?: string;
    状态?: string;
    上级?: number[];
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
    private readonly roleManagerService: RoleManagerService,
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

    // --- Phase 1: parse all records, collect lookup keys ---
    interface RecordToSync {
      sudaUserId: string;
      employeeNo: string;
      position: string;
      department: string;
      role: string;
      status: string;
      supervisorUserId: string;
    }
    const parsed: RecordToSync[] = [];
    for (const item of allRecords) {
      const userIds = item.record['姓名'];
      const sudaUserId =
        Array.isArray(userIds) && userIds.length > 0 ? String(userIds[0]) : '';
      const employeeNo = item.record['编号']?.text || '';
      if (!sudaUserId && !employeeNo) continue;
      const supervisorIds = item.record['上级'];
      const supervisorUserId =
        Array.isArray(supervisorIds) && supervisorIds.length > 0
          ? String(supervisorIds[0])
          : '';
      parsed.push({
        sudaUserId,
        employeeNo,
        position: item.record['岗位'] || '',
        department: item.record['部门'] || '',
        role: item.record['角色'] || '',
        status: item.record['状态'] || '',
        supervisorUserId,
      });
    }

    // --- Phase 2: batch-query existing employees ---
    const allUserIds = parsed
      .filter((p) => p.sudaUserId)
      .map((p) => p.sudaUserId);
    const allEmpNos = parsed
      .filter((p) => p.employeeNo)
      .map((p) => p.employeeNo);

    const userIdParts = allUserIds.map((id) => sql`${id}`);
    const empNoParts = allEmpNos.map((no) => sql`${no}`);

    const byUserId = new Map<string, typeof employee.$inferSelect>();
    const byEmpNo = new Map<string, typeof employee.$inferSelect>();

    if (userIdParts.length > 0) {
      const rows = await this.db
        .select()
        .from(employee)
        .where(
          and(
            // IN clause for user_ids extracted from composite id
            sql`(${employee.id}).user_id IN (${sql.join(userIdParts, sql`, `)})`,
            isNull(employee.deletedAt),
          ),
        );
      for (const r of rows) {
        byUserId.set(String(r.id), r);
      }
    }

    if (empNoParts.length > 0) {
      const rows = await this.db
        .select()
        .from(employee)
        .where(
          and(
            inArray(employee.employeeNo, allEmpNos),
            isNull(employee.deletedAt),
          ),
        );
      for (const r of rows) {
        if (r.employeeNo) byEmpNo.set(r.employeeNo, r);
      }
    }

    // --- Phase 3: apply updates / create new ---
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const p of parsed) {
      try {
        // Match: userId first, then employeeNo fallback
        const existing =
          byUserId.get(p.sudaUserId) ?? byEmpNo.get(p.employeeNo);
        if (!existing) {
          if (!p.sudaUserId) {
            skipped++;
            continue;
          }
          try {
            const softDeleted = await this.db
              .select()
              .from(employee)
              .where(
                and(
                  sql`(${employee.id}).user_id = ${p.sudaUserId}`,
                  isNotNull(employee.deletedAt),
                ),
              )
              .limit(1);

            if (softDeleted.length > 0) {
              await this.db
                .update(employee)
                .set({
                  name: p.sudaUserId,
                  position: p.position || '',
                  department: p.department || '',
                  role: p.role || 'employee',
                  status: p.status || 'active',
                  employeeNo: p.employeeNo || null,
                  supervisorId: p.supervisorUserId || null,
                  deletedAt: null,
                })
                .where(eq(employee.id, softDeleted[0].id));
            } else {
              await this.db.insert(employee).values({
                id: p.sudaUserId,
                name: p.sudaUserId,
                position: p.position || '',
                department: p.department || '',
                role: p.role || 'employee',
                status: p.status || 'active',
                employeeNo: p.employeeNo || null,
                supervisorId: p.supervisorUserId || null,
              });
            }
            created++;
            try {
              await this.roleManagerService.addUserToEmployeeRole(p.sudaUserId);
            } catch (err) {
              this.logger.warn(
                `Failed to add ${p.sudaUserId} to employee role: ${err}`,
              );
            }
          } catch (err) {
            failed++;
            const cause = (err as { cause?: { code?: string; detail?: string; constraint?: string; message?: string } }).cause;
            this.logger.error(
              `Failed to insert bitable record (userId=${p.sudaUserId}): ${err instanceof Error ? err.message : String(err)}${cause ? ` | pg: code=${cause.code || ''} detail=${cause.detail || cause.message || ''} constraint=${cause.constraint || ''}` : ''}`,
            );
          }
          continue;
        }

        const updateData: Record<string, unknown> = {};
        if (p.position) updateData.position = p.position;
        if (p.department) updateData.department = p.department;
        if (p.role) updateData.role = p.role;
        if (p.status) updateData.status = p.status;
        if (p.employeeNo) updateData.employeeNo = p.employeeNo;
        // supervisorId is userProfile composite type — cannot assign plain string.
        // Skipped here; use bitable-connection if supervisor sync via 工号 is needed.

        if (Object.keys(updateData).length > 0) {
          await this.db
            .update(employee)
            .set(updateData)
            .where(
              sql`(id).user_id = ${p.sudaUserId || sql`(${existing.id}).user_id`}`,
            );
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to process bitable record: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await this.db.insert(auditLog).values({
      action: 'import_from_bitable_plugin',
      targetType: 'bitable_sync',
      targetId: PLUGIN_INSTANCE_ID,
      changes: {
        total: allRecords.length,
        created,
        updated,
        skipped,
        failed,
      },
    });

    return {
      total: allRecords.length,
      created,
      updated,
      skipped,
      failed,
      message: `导入完成：新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条，失败 ${failed} 条`,
    };
  }

  async exportToBitable(): Promise<BitablePluginSyncResponse> {
    // Extract user_id from userProfile composite type via SQL
    const employees = await this.db
      .select({
        userId: sql<string>`(${employee.id}).user_id`,
        id: employee.id,
        name: employee.name,
        employeeNo: employee.employeeNo,
        position: employee.position,
        department: employee.department,
        role: employee.role,
        status: employee.status,
        supervisorUserId: sql<string>`COALESCE((${employee.supervisorId}).user_id, '')`,
      })
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
      if (!emp.userId) continue;

      const numericUserId = Number(emp.userId);
      if (Number.isNaN(numericUserId)) continue;

      const supervisorNum = emp.supervisorUserId
        ? Number(emp.supervisorUserId)
        : NaN;
      const record: Record<string, unknown> = {
        姓名: [numericUserId],
        编号: emp.employeeNo || '',
        岗位: emp.position || '',
        部门: emp.department || '',
        角色: emp.role || '',
        状态: emp.status || '',
        上级: Number.isNaN(supervisorNum) ? [] : [supervisorNum],
      };

      const existingRecordId =
        bitableRecordByUserId.get(emp.userId) ??
        (emp.employeeNo ? bitableRecordByEmpNo.get(emp.employeeNo) : undefined);

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
      action: 'export_to_bitable_plugin',
      targetType: 'bitable_sync',
      targetId: PLUGIN_INSTANCE_ID,
      changes: {
        total: employees.length,
        created,
        updated,
        failed,
      },
    });

    return {
      total: employees.length,
      created,
      updated,
      skipped: 0, // All employees are processed (either created or updated); failures are counted in failed
      failed,
      message: `导出完成：新增 ${created} 条，更新 ${updated} 条，失败 ${failed} 条`,
    };
  }
}

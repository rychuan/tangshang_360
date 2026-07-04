// server/modules/bitable-connection/bitable-connection.service.ts
import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import * as crypto from 'crypto';
import {
  bitableConnection,
  bitableSyncLog,
  employee,
  assessmentTemplate,
  department,
  employeeBinding,
  auditLog,
} from '@server/database/schema';
import { EmployeeBindingService } from '../employee-management/employee-binding.service';
import { RoleManagerService } from '../role-manager/role-manager.service';
import type {
  BitableConnectionItem,
  BitableConnectionListResponse,
  CreateBitableConnectionRequest,
  BitableSyncLogItem,
  BitableSyncLogDetail,
  BitableSyncLogListResponse,
  BitableImportResponse,
  BitableExportResponse,
} from '@shared/api.interface';

const ENCRYPTION_KEY = process.env.BITABLE_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'BITABLE_ENCRYPTION_KEY not configured — encryption unavailable',
    );
  }
  return Buffer.from(ENCRYPTION_KEY, 'utf8');
}

function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: authTag.toString('hex'),
  });
}

function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const { iv, data, tag } = JSON.parse(encrypted);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// 多维表格列名 → 系统字段名
const FIELD_MAP: Record<string, string> = {
  姓名: 'name',
  工号: 'employeeNo',
  岗位: 'position',
  部门: 'department',
  上级工号: 'supervisorNo',
  职位: 'title',
  角色: 'role',
  手机: 'phone',
  入职日期: 'hireDate',
  状态: 'status',
  考核模板: 'templateName',
};

const VALID_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor', 'employee'];
const VALID_STATUSES = ['active', 'inactive'];

interface ParsedRow {
  name?: string;
  employeeNo?: string;
  position?: string;
  department?: string;
  supervisorNo?: string;
  supervisorId?: string;
  title?: string;
  role?: string;
  phone?: string;
  hireDate?: string;
  status?: string;
  templateName?: string;
}

@Injectable()
export class BitableConnectionService {
  private readonly logger = new Logger(BitableConnectionService.name);
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly bindingService: EmployeeBindingService,
    private readonly roleManagerService: RoleManagerService,
  ) {
    if (!ENCRYPTION_KEY) {
      this.logger.warn(
        '[BitableConnection] BITABLE_ENCRYPTION_KEY not set — encryption unavailable',
      );
    }
  }

  async list(query: {
    page: number;
    pageSize: number;
  }): Promise<BitableConnectionListResponse> {
    const offset = (query.page - 1) * query.pageSize;

    const [items, totalResult] = await Promise.all([
      this.db
        .select({
          id: bitableConnection.id,
          name: bitableConnection.name,
          bitableAppToken: bitableConnection.bitableAppToken,
          tableId: bitableConnection.tableId,
          isActive: bitableConnection.isActive,
          createdAt: bitableConnection.createdAt,
          updatedAt: bitableConnection.updatedAt,
          lastSyncAt: sql<string>`(
            SELECT MAX(l.started_at::text) FROM bitable_sync_log l
            WHERE l.connection_id = ${bitableConnection.id}
          )`,
        })
        .from(bitableConnection)
        .where(isNull(bitableConnection.deletedAt))
        .orderBy(desc(bitableConnection.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(bitableConnection)
        .where(isNull(bitableConnection.deletedAt)),
    ]);

    return {
      items: items.map((item) => ({
        id: String(item.id),
        name: item.name,
        bitableAppToken: item.bitableAppToken,
        tableId: item.tableId,
        isActive: item.isActive,
        lastSyncAt: item.lastSyncAt || undefined,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : String(item.createdAt),
        updatedAt:
          item.updatedAt instanceof Date
            ? item.updatedAt.toISOString()
            : String(item.updatedAt),
      })),
      total: Number(totalResult[0]?.count || 0),
    };
  }

  async create(
    body: CreateBitableConnectionRequest,
    userId: string,
  ): Promise<{ id: string }> {
    const [inserted] = await this.db
      .insert(bitableConnection)
      .values({
        name: body.name,
        appId: body.appId,
        appSecret: encryptSecret(body.appSecret),
        bitableAppToken: body.bitableAppToken,
        tableId: body.tableId,
      })
      .returning({ id: bitableConnection.id });

    const id = String(inserted.id);
    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'create_bitable_connection',
      targetType: 'bitable_connection',
      targetId: id,
      changes: {
        name: body.name,
        bitableAppToken: body.bitableAppToken,
        tableId: body.tableId,
      },
    });

    this.logger.log(`Bitable connection created: ${body.name} (${id})`);
    return { id };
  }

  async update(
    id: string,
    body: CreateBitableConnectionRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: bitableConnection.id, name: bitableConnection.name })
      .from(bitableConnection)
      .where(
        and(eq(bitableConnection.id, id), isNull(bitableConnection.deletedAt)),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('连接不存在');
    }

    const updateData: Record<string, unknown> = {
      name: body.name,
      bitableAppToken: body.bitableAppToken,
      tableId: body.tableId,
    };
    if (body.appId) updateData.appId = body.appId;
    if (body.appSecret) updateData.appSecret = encryptSecret(body.appSecret);
    await this.db
      .update(bitableConnection)
      .set(updateData)
      .where(eq(bitableConnection.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'update_bitable_connection',
      targetType: 'bitable_connection',
      targetId: id,
      changes: updateData,
    });

    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: bitableConnection.id, name: bitableConnection.name })
      .from(bitableConnection)
      .where(
        and(eq(bitableConnection.id, id), isNull(bitableConnection.deletedAt)),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('连接不存在');
    }

    await this.db
      .update(bitableConnection)
      .set({ deletedAt: new Date() })
      .where(eq(bitableConnection.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'remove_bitable_connection',
      targetType: 'bitable_connection',
      targetId: id,
      changes: { name: rows[0].name },
    });

    return { success: true };
  }

  async detail(id: string): Promise<BitableConnectionItem> {
    const rows = await this.db
      .select({
        id: bitableConnection.id,
        name: bitableConnection.name,
        bitableAppToken: bitableConnection.bitableAppToken,
        tableId: bitableConnection.tableId,
        isActive: bitableConnection.isActive,
        createdAt: bitableConnection.createdAt,
        updatedAt: bitableConnection.updatedAt,
        lastSyncAt: sql<string>`(
          SELECT MAX(l.started_at::text) FROM bitable_sync_log l
          WHERE l.connection_id = ${bitableConnection.id}
        )`,
      })
      .from(bitableConnection)
      .where(
        and(eq(bitableConnection.id, id), isNull(bitableConnection.deletedAt)),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('连接不存在');
    }

    const item = rows[0];
    return {
      id: String(item.id),
      name: item.name,
      bitableAppToken: item.bitableAppToken,
      tableId: item.tableId,
      isActive: item.isActive,
      lastSyncAt: item.lastSyncAt || undefined,
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : String(item.createdAt),
      updatedAt:
        item.updatedAt instanceof Date
          ? item.updatedAt.toISOString()
          : String(item.updatedAt),
    };
  }

  private async getAccessToken(
    appId: string,
    appSecretEncrypted: string,
  ): Promise<string> {
    const cached = this.tokenCache.get(appId);
    if (cached && Date.now() < cached.expiresAt - 60_000) {
      return cached.token;
    }

    const decryptedSecret = decryptSecret(appSecretEncrypted);
    const response = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          app_secret: decryptedSecret,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to get tenant_access_token: ${response.status} ${body}`,
      );
    }

    const data = (await response.json()) as {
      code: number;
      msg: string;
      tenant_access_token: string;
      expire: number;
    };

    if (data.code !== 0) {
      throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
    }

    this.tokenCache.set(appId, {
      token: data.tenant_access_token,
      expiresAt: Date.now() + data.expire * 1000,
    });

    return data.tenant_access_token;
  }

  private async fetchBitableRecords(
    appToken: string,
    tableId: string,
    accessToken: string,
  ): Promise<Array<{ record_id: string; fields: Record<string, unknown> }>> {
    const allRecords: Array<{
      record_id: string;
      fields: Record<string, unknown>;
    }> = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      if (pageToken) params.set('page_token', pageToken);
      params.set('page_size', '500');

      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Failed to fetch bitable records: ${response.status} ${body}`,
        );
      }

      const data = (await response.json()) as {
        code: number;
        msg: string;
        data: {
          has_more: boolean;
          page_token: string;
          total: number;
          items: Array<{
            record_id: string;
            fields: Record<string, unknown>;
          }>;
        };
      };

      if (data.code !== 0) {
        throw new Error(`Bitable API error: ${data.code} ${data.msg}`);
      }

      allRecords.push(...(data.data?.items || []));
      pageToken = data.data?.has_more ? data.data.page_token : undefined;
    } while (pageToken);

    return allRecords;
  }

  private parseRow(fields: Record<string, unknown>): ParsedRow {
    const row: ParsedRow = {};
    for (const [bitableCol, sysField] of Object.entries(FIELD_MAP)) {
      const value = fields[bitableCol];
      if (value === undefined || value === null || value === '') continue;

      const textVal = Array.isArray(value)
        ? value
            .map((v) =>
              typeof v === 'object' && v !== null && 'text' in v
                ? (v as { text: string }).text
                : String(v),
            )
            .join(', ')
        : String(value);

      (row as Record<string, unknown>)[sysField] = textVal;
    }
    return row;
  }

  private async resolveSupervisorId(
    supervisorNo: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ id: employee.employeeId })
        .from(employee)
        .where(
          and(eq(employee.employeeNo, supervisorNo), isNull(employee.deletedAt)),
        )
        .limit(1);
    return rows.length > 0 ? String(rows[0].id) : null;
  }

  private validateRow(
    row: ParsedRow,
    validDepts: Set<string>,
    templateMap: Map<string, string>,
  ): string | null {
    if (!row.name) return '缺少姓名';
    if (!row.employeeNo) return '缺少工号';
    if (!row.position) return '缺少岗位';
    if (row.department && !validDepts.has(row.department)) {
      return `部门「${row.department}」不存在`;
    }
    if (row.role && !VALID_ROLES.includes(row.role)) {
      return `角色「${row.role}」不合法`;
    }
    if (row.status && !VALID_STATUSES.includes(row.status)) {
      return `状态「${row.status}」不合法`;
    }
    if (row.templateName && !templateMap.has(row.templateName)) {
      return `考核模板「${row.templateName}」不存在`;
    }
    return null;
  }

  async importEmployees(
    connectionId: string,
    userId: string,
  ): Promise<BitableImportResponse> {
    const connRow = await this.db
      .select()
      .from(bitableConnection)
      .where(
        and(
          eq(bitableConnection.id, connectionId),
          isNull(bitableConnection.deletedAt),
          eq(bitableConnection.isActive, true),
        ),
      )
      .limit(1);

    if (connRow.length === 0) {
      throw new NotFoundException('连接不存在或已停用');
    }

    const startedAt = new Date();
    const details: BitableSyncLogDetail['details'] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      const token = await this.getAccessToken(
        connRow[0].appId,
        connRow[0].appSecret,
      );
      const records = await this.fetchBitableRecords(
        connRow[0].bitableAppToken,
        connRow[0].tableId,
        token,
      );

      // 预加载校验字典
      const deptRows = await this.db
        .select({ name: department.name })
        .from(department)
        .where(eq(department.isActive, true));
      const validDepts = new Set(deptRows.map((d) => d.name));

      const templateRows = await this.db
        .select({
          name: assessmentTemplate.name,
          id: assessmentTemplate.id,
        })
        .from(assessmentTemplate);
      const templateMap = new Map(templateRows.map((t) => [t.name, t.id]));

      const now = new Date().toISOString().substring(0, 7); // YYYY-MM

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          const row = this.parseRow(record.fields);

          // 解析上级工号
          if (row.supervisorNo) {
            row.supervisorId = await this.resolveSupervisorId(row.supervisorNo);
          }

          const validationError = this.validateRow(
            row,
            validDepts,
            templateMap,
          );
          if (validationError) {
            skippedCount++;
            details.push({
              row: i + 1,
              employeeNo: row.employeeNo || '',
              name: row.name || '',
              status: 'skipped',
              reason: validationError,
            });
            continue;
          }

          // 按工号匹配已有员工
          const existing = await this.db
            .select()
            .from(employee)
            .where(
              and(
                eq(employee.employeeNo, row.employeeNo!),
                isNull(employee.deletedAt),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            // 更新已有员工
            await this.db.transaction(async (tx) => {
              await tx
                .update(employee)
                .set({
                  name: row.name!,
                  position: row.position!,
                  department: row.department || existing[0].department,
                  title: row.title || existing[0].title,
                  role: row.role || existing[0].role,
                  phone: row.phone || existing[0].phone,
                  hireDate: row.hireDate
                    ? new Date(row.hireDate)
                    : existing[0].hireDate,
                  status:
                    row.status === 'inactive' ? false : true,
                  supervisorId: row.supervisorId || existing[0].supervisorId,
                })
                .where(eq(employee.employeeId, existing[0].id));
            });
            updatedCount++;
            details.push({
              row: i + 1,
              employeeNo: row.employeeNo!,
              name: row.name!,
              status: 'updated',
            });

            // 仅当员工无活跃绑定时绑定模板
            if (row.templateName && templateMap.has(row.templateName)) {
              const activeBinding = await this.db
                .select({ id: employeeBinding.id })
                .from(employeeBinding)
                .where(
                  and(
                    eq(employeeBinding.employeeId, String(existing[0].id)),
                    eq(employeeBinding.status, true),
                  ),
                )
                .limit(1);
              if (activeBinding.length === 0) {
                await this.bindingService.bind(
                  String(existing[0].id),
                  templateMap.get(row.templateName)!,
                  now,
                  userId,
                );
              }
            }
          } else {
            // 新增员工
            // id is a userProfile composite type, not a simple string.
            // Omit it — the employeeNo field records the identifier.
            const values = {
              name: row.name!,
              position: row.position!,
              employeeNo: row.employeeNo!,
              department: row.department || '',
              title: row.title || null,
              role: row.role || 'employee',
              phone: row.phone || null,
              hireDate: row.hireDate ? new Date(row.hireDate) : null,
              status: row.status === 'inactive' ? false : true,
              supervisorId: row.supervisorId || null,
              bitableConnectionId: connectionId,
            };

            const [inserted] = await this.db.transaction(async (tx) => {
              return tx
                .insert(employee)
                .values(values as any)
                .returning({ id: employee.employeeId });
            });
            createdCount++;
            details.push({
              row: i + 1,
              employeeNo: row.employeeNo!,
              name: row.name!,
              status: 'created',
            });

            // 加入 employee 角色
            try {
              await this.roleManagerService.addUserToEmployeeRole(
                row.employeeNo!,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to add ${row.employeeNo} to employee role: ${err}`,
              );
            }

            // 模板绑定
            if (row.templateName && templateMap.has(row.templateName)) {
              await this.bindingService.bind(
                String(inserted.id),
                templateMap.get(row.templateName)!,
                now,
                userId,
              );
            }
          }
        } catch (err) {
          failedCount++;
          const reason = err instanceof Error ? err.message : String(err);
          details.push({
            row: i + 1,
            employeeNo: '',
            name: '',
            status: 'failed',
            reason,
          });
          this.logger.error(`Import row ${i + 1} failed: ${reason}`);
        }
      }

      const status =
        failedCount === 0 && skippedCount === 0 ? 'success' : 'partial';
      const [logRow] = await this.db
        .insert(bitableSyncLog)
        .values({
          connectionId,
          direction: 'import',
          status,
          totalCount: records.length,
          createdCount,
          updatedCount,
          skippedCount,
          failedCount,
          details: details as any,
          operatorId: userId,
          startedAt,
          completedAt: new Date(),
        })
        .returning({ id: bitableSyncLog.id });

      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'import_employees',
        targetType: 'bitable_connection',
        targetId: connectionId,
        changes: {
          totalCount: records.length,
          createdCount,
          updatedCount,
          skippedCount,
          failedCount,
        },
      });

      const connName = connRow[0].name;
      return {
        success: status === 'success',
        connectionId,
        connectionName: connName,
        totalCount: records.length,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        logId: String(logRow.id),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.db.insert(bitableSyncLog).values({
        connectionId,
        direction: 'import',
        status: 'failed',
        totalCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        details: [],
        errorMessage,
        operatorId: userId,
        startedAt,
        completedAt: new Date(),
      });
      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'import_employees',
        targetType: 'bitable_connection',
        targetId: connectionId,
        changes: { error: errorMessage },
      });
      throw err;
    }
  }

  async exportEmployees(
    connectionId: string,
    userId: string,
  ): Promise<BitableExportResponse> {
    const connRow = await this.db
      .select()
      .from(bitableConnection)
      .where(
        and(
          eq(bitableConnection.id, connectionId),
          isNull(bitableConnection.deletedAt),
          eq(bitableConnection.isActive, true),
        ),
      )
      .limit(1);

    if (connRow.length === 0) {
      throw new NotFoundException('连接不存在或已停用');
    }

    const startedAt = new Date();
    let syncedCount = 0;
    let failedCount = 0;
    const details: BitableSyncLogDetail['details'] = [];

    try {
      const token = await this.getAccessToken(
        connRow[0].appId,
        connRow[0].appSecret,
      );

      const employees = await this.db
        .select()
        .from(employee)
        .where(
          and(
            sql`bitable_connection_id = ${connectionId}::uuid`,
            isNull(employee.deletedAt),
          ),
        );

      const reverseMap: Record<string, string> = {};
      for (const [bitableCol, sysField] of Object.entries(FIELD_MAP)) {
        if (sysField !== 'supervisorNo' && sysField !== 'templateName') {
          reverseMap[sysField] = bitableCol;
        }
      }

      const appToken = connRow[0].bitableAppToken;
      const tableId = connRow[0].tableId;

      // 预取多维表格所有记录，避免在循环中重复调用（N+1问题）
      const allBitableRecords = await this.fetchBitableRecords(
        appToken,
        tableId,
        token,
      );

      for (const emp of employees) {
        try {
          const fields: Record<string, unknown> = {};
          if (emp.name) fields[reverseMap['name']] = emp.name;
          if (emp.employeeNo) fields[reverseMap['employeeNo']] = emp.employeeNo;
          if (emp.position) fields[reverseMap['position']] = emp.position;
          if (emp.department) fields[reverseMap['department']] = emp.department;
          if (emp.title) fields[reverseMap['title']] = emp.title;
          if (emp.role) fields[reverseMap['role']] = emp.role;
          if (emp.phone) fields[reverseMap['phone']] = emp.phone;
          if (emp.hireDate) {
            fields[reverseMap['hireDate']] =
              emp.hireDate instanceof Date
                ? emp.hireDate.toISOString().substring(0, 10)
                : emp.hireDate;
          }
          fields[reverseMap['status']] = emp.status ? 'active' : 'inactive';

          // 使用已缓存的记录查找工号匹配的行
          const matched = allBitableRecords.find(
            (r) => String(r.fields['工号'] || '') === emp.employeeNo,
          );

          if (matched) {
            await fetch(
              `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${matched.record_id}`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fields }),
              },
            );
          } else {
            await fetch(
              `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fields }),
              },
            );
          }

          syncedCount++;
          details.push({
            row: syncedCount,
            employeeNo: emp.employeeNo || '',
            name: emp.name,
            status: 'updated',
          });
        } catch (err) {
          failedCount++;
          const reason = err instanceof Error ? err.message : String(err);
          details.push({
            row: syncedCount + failedCount,
            employeeNo: emp.employeeNo || '',
            name: emp.name,
            status: 'failed',
            reason,
          });
          this.logger.error(`Export employee ${emp.name} failed: ${reason}`);
        }
      }

      const status = failedCount === 0 ? 'success' : 'partial';
      const [logRow] = await this.db
        .insert(bitableSyncLog)
        .values({
          connectionId,
          direction: 'export',
          status,
          totalCount: employees.length,
          createdCount: 0,
          updatedCount: syncedCount,
          skippedCount: 0,
          failedCount,
          details: details as any,
          operatorId: userId,
          startedAt,
          completedAt: new Date(),
        })
        .returning({ id: bitableSyncLog.id });

      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'export_employees',
        targetType: 'bitable_connection',
        targetId: connectionId,
        changes: { totalCount: employees.length, syncedCount, failedCount },
      });

      return {
        success: status === 'success',
        connectionId,
        totalCount: employees.length,
        syncedCount,
        failedCount,
        logId: String(logRow.id),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.db.insert(bitableSyncLog).values({
        connectionId,
        direction: 'export',
        status: 'failed',
        totalCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        details: [],
        errorMessage,
        operatorId: userId,
        startedAt,
        completedAt: new Date(),
      });
      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'export_employees',
        targetType: 'bitable_connection',
        targetId: connectionId,
        changes: { error: errorMessage },
      });
      throw err;
    }
  }

  async getLogs(
    connectionId: string,
    query: { page: number; pageSize: number },
  ): Promise<BitableSyncLogListResponse> {
    const offset = (query.page - 1) * query.pageSize;

    const [items, totalResult] = await Promise.all([
      this.db
        .select({
          id: bitableSyncLog.id,
          direction: bitableSyncLog.direction,
          status: bitableSyncLog.status,
          totalCount: bitableSyncLog.totalCount,
          createdCount: bitableSyncLog.createdCount,
          updatedCount: bitableSyncLog.updatedCount,
          skippedCount: bitableSyncLog.skippedCount,
          failedCount: bitableSyncLog.failedCount,
          errorMessage: bitableSyncLog.errorMessage,
          operatorId: bitableSyncLog.operatorId,
          startedAt: bitableSyncLog.startedAt,
          completedAt: bitableSyncLog.completedAt,
          operatorName: sql<string>`COALESCE((SELECT e.name FROM employee e WHERE (e.employee_id).user_id = (${bitableSyncLog.operatorId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
        })
        .from(bitableSyncLog)
        .where(eq(bitableSyncLog.connectionId, connectionId))
        .orderBy(desc(bitableSyncLog.startedAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(bitableSyncLog)
        .where(eq(bitableSyncLog.connectionId, connectionId)),
    ]);

    return {
      items: items.map((item) => ({
        id: String(item.id),
        direction: item.direction as 'import' | 'export',
        status: item.status as 'success' | 'partial' | 'failed',
        totalCount: item.totalCount || 0,
        createdCount: item.createdCount || 0,
        updatedCount: item.updatedCount || 0,
        skippedCount: item.skippedCount || 0,
        failedCount: item.failedCount || 0,
        errorMessage: item.errorMessage || undefined,
        operatorName: String(item.operatorName || ''),
        startedAt:
          item.startedAt instanceof Date
            ? item.startedAt.toISOString()
            : String(item.startedAt),
        completedAt:
          item.completedAt instanceof Date
            ? item.completedAt.toISOString()
            : item.completedAt || undefined,
      })),
      total: Number(totalResult[0]?.count || 0),
    };
  }

  async getLogDetail(
    connectionId: string,
    logId: string,
  ): Promise<BitableSyncLogDetail> {
    const rows = await this.db
      .select({
        id: bitableSyncLog.id,
        direction: bitableSyncLog.direction,
        status: bitableSyncLog.status,
        totalCount: bitableSyncLog.totalCount,
        createdCount: bitableSyncLog.createdCount,
        updatedCount: bitableSyncLog.updatedCount,
        skippedCount: bitableSyncLog.skippedCount,
        failedCount: bitableSyncLog.failedCount,
        details: bitableSyncLog.details,
        errorMessage: bitableSyncLog.errorMessage,
        operatorId: bitableSyncLog.operatorId,
        startedAt: bitableSyncLog.startedAt,
        completedAt: bitableSyncLog.completedAt,
        operatorName: sql<string>`COALESCE((SELECT e.name FROM employee e WHERE (e.employee_id).user_id = (${bitableSyncLog.operatorId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(bitableSyncLog)
      .where(
        and(
          eq(bitableSyncLog.connectionId, connectionId),
          eq(bitableSyncLog.id, logId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('日志不存在');
    }

    const item = rows[0];
    return {
      id: String(item.id),
      direction: item.direction as 'import' | 'export',
      status: item.status as 'success' | 'partial' | 'failed',
      totalCount: item.totalCount || 0,
      createdCount: item.createdCount || 0,
      updatedCount: item.updatedCount || 0,
      skippedCount: item.skippedCount || 0,
      failedCount: item.failedCount || 0,
      errorMessage: item.errorMessage || undefined,
      operatorName: String(item.operatorName || ''),
      startedAt:
        item.startedAt instanceof Date
          ? item.startedAt.toISOString()
          : String(item.startedAt),
      completedAt:
        item.completedAt instanceof Date
          ? item.completedAt.toISOString()
          : String(item.completedAt),
      details: (item.details as BitableSyncLogDetail['details']) || [],
    };
  }
}

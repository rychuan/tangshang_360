# 多维表格员工导入/双向同步 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从飞书多维表格（Bitable）导入员工并保持双向同步，包含连接管理、字段映射校验、自动模板绑定、操作日志追溯。

**Architecture:** 新增 `bitable-connection` NestJS 模块（controller + service），前端在 EmployeeManagementPage 中新增「多维表格连接」Tab。新增 `bitable_connection` 和 `bitable_sync_log` 两张数据库表，`employee` 表新增 `bitable_connection_id` 字段。

**Tech Stack:** NestJS 10（控制器/服务/模块模式）、Drizzle ORM、React 19 + shadcn/ui、飞书开放平台 API（tenant_access_token + Bitable Records CRUD）、AES-256-GCM 凭据加密。

## Global Constraints

- 仅 `admin` 可管理连接（新建/编辑/删除）
- `admin` 和 `hrd` 可执行导入/导出
- 字段映射使用固定列名约定（姓名、工号、岗位等 10 列）
- 工号（employeeNo）作为员工唯一匹配键
- 多维表格为准：导入时覆盖系统数据
- `app_secret` 必须 AES-256-GCM 加密存储
- 飞书 API 调用仅服务端发起，不暴露凭据到前端
- `server/database/schema.ts` 为自动生成，自定义表在 `server/database/custom/` 独立定义
- 提交消息遵循 conventional commits 格式

---

### Task 1: 共享类型定义

**Files:**
- Modify: `shared/api.interface.ts`（末尾追加）

**Interfaces:**
- Produces: `BitableConnectionItem`, `BitableConnectionListResponse`, `CreateBitableConnectionRequest`, `BitableSyncLogItem`, `BitableSyncLogDetail`, `BitableSyncLogListResponse`, `BitableImportResponse`, `BitableExportResponse`

- [ ] **Step 1: 在 shared/api.interface.ts 末尾追加类型定义**

```typescript
// === Bitable Connection ===

export interface BitableConnectionItem {
  id: string;
  name: string;
  bitableAppToken: string;
  tableId: string;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BitableConnectionListResponse {
  items: BitableConnectionItem[];
  total: number;
}

export interface CreateBitableConnectionRequest {
  name: string;
  appId: string;
  appSecret: string;
  bitableAppToken: string;
  tableId: string;
}

export interface BitableSyncLogItem {
  id: string;
  direction: 'import' | 'export';
  status: 'success' | 'partial' | 'failed';
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage?: string;
  operatorName: string;
  startedAt: string;
  completedAt?: string;
}

export interface BitableSyncLogDetail extends BitableSyncLogItem {
  details: Array<{
    row: number;
    employeeNo: string;
    name: string;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

export interface BitableSyncLogListResponse {
  items: BitableSyncLogItem[];
  total: number;
}

export interface BitableImportResponse {
  success: boolean;
  connectionId: string;
  connectionName: string;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  logId: string;
}

export interface BitableExportResponse {
  success: boolean;
  connectionId: string;
  totalCount: number;
  syncedCount: number;
  failedCount: number;
  logId: string;
}
```

- [ ] **Step 2: 类型检查**

Run: `cd /Users/rychuan/CodingFarmer/tangshang_360 && npx tsc --noEmit -p shared/tsconfig.json 2>&1 || true`
Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add shared/api.interface.ts
git commit -m "feat: add Bitable connection shared types"
```

---

### Task 2: 数据库 Schema 与迁移

**Files:**
- Create: `server/database/custom/bitable-connection.schema.ts`
- Create: `server/database/custom/index.ts`
- Create: `server/database/migrations/001_bitable_connection.sql`

**Interfaces:**
- Produces: `bitableConnection` 表定义, `bitableSyncLog` 表定义

- [ ] **Step 1: 创建 Drizzle schema 定义**

```typescript
// server/database/custom/bitable-connection.schema.ts
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  jsonb,
  text,
  customTimestamptz,
  userProfile,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const bitableConnection = pgTable('bitable_connection', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  appId: varchar('app_id', { length: 100 }).notNull(),
  appSecret: text('app_secret').notNull(),
  bitableAppToken: varchar('bitable_app_token', { length: 200 }).notNull(),
  tableId: varchar('table_id', { length: 200 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: userProfile('_created_by'),
  createdAt: customTimestamptz('_created_at', { precision: 6 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz('_updated_at', { precision: 6 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: userProfile('_updated_by'),
  deletedAt: customTimestamptz('deleted_at', { precision: 6 }),
});

export const bitableSyncLog = pgTable('bitable_sync_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').notNull(),
  direction: varchar('direction', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  totalCount: integer('total_count').default(0),
  createdCount: integer('created_count').default(0),
  updatedCount: integer('updated_count').default(0),
  skippedCount: integer('skipped_count').default(0),
  failedCount: integer('failed_count').default(0),
  details: jsonb('details'),
  errorMessage: text('error_message'),
  operatorId: userProfile('operator_id').notNull(),
  startedAt: customTimestamptz('started_at', { precision: 6 }).notNull(),
  completedAt: customTimestamptz('completed_at', { precision: 6 }),
});
```

- [ ] **Step 2: 创建 custom index**

```typescript
// server/database/custom/index.ts
export { bitableConnection, bitableSyncLog } from './bitable-connection.schema';
```

- [ ] **Step 3: 创建 SQL 迁移脚本**

```sql
-- server/database/migrations/001_bitable_connection.sql
CREATE TABLE IF NOT EXISTS bitable_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  app_id VARCHAR(100) NOT NULL,
  app_secret TEXT NOT NULL,
  bitable_app_token VARCHAR(200) NOT NULL,
  table_id VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  _created_by user_profile,
  _created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  deleted_at TIMESTAMPTZ(6)
);

CREATE TABLE IF NOT EXISTS bitable_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  direction VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  details JSONB,
  error_message TEXT,
  operator_id user_profile NOT NULL,
  started_at TIMESTAMPTZ(6) NOT NULL,
  completed_at TIMESTAMPTZ(6)
);

ALTER TABLE employee ADD COLUMN IF NOT EXISTS bitable_connection_id UUID;
```

- [ ] **Step 4: 提交**

```bash
git add server/database/custom/ server/database/migrations/
git commit -m "feat: add bitable connection custom schema and migration"
```

---

### Task 3: BitableConnectionService（核心业务逻辑）

**Files:**
- Create: `server/modules/bitable-connection/bitable-connection.service.ts`
- Create: `server/modules/bitable-connection/bitable-connection.service.spec.ts`

**Interfaces:**
- Consumes: 共享类型（from Task 1）, schema 定义（from Task 2）, `EmployeeBindingService`, `RoleManagerService`
- Produces: `BitableConnectionService` with methods `list()`, `create()`, `update()`, `remove()`, `detail()`, `importEmployees()`, `exportEmployees()`, `getLogs()`, `getLogDetail()`

- [ ] **Step 1: 创建服务文件骨架与加密工具函数**

```typescript
// server/modules/bitable-connection/bitable-connection.service.ts
import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
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
} from '@server/database/custom/bitable-connection.schema';
import {
  employee,
  assessmentTemplate,
  department,
  employeeBinding,
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

const ENCRYPTION_KEY =
  process.env.BITABLE_ENCRYPTION_KEY || 'dev-fallback-key-min-32-chars!!';
const ALGORITHM = 'aes-256-gcm';

function encryptSecret(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8');
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
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8');
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
  '姓名': 'name',
  '工号': 'employeeNo',
  '岗位': 'position',
  '部门': 'department',
  '上级工号': 'supervisorNo',
  '职位': 'title',
  '角色': 'role',
  '手机': 'phone',
  '入职日期': 'hireDate',
  '状态': 'status',
  '考核模板': 'templateName',
};

const VALID_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor', 'employee'];
const VALID_STATUSES = ['active', 'inactive'];

@Injectable()
export class BitableConnectionService {
  private readonly logger = new Logger(BitableConnectionService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly bindingService: EmployeeBindingService,
    private readonly roleManagerService: RoleManagerService,
  ) {}

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

  // Step 2-8 补充 create, update, remove, detail, importEmployees, exportEmployees, getLogs, getLogDetail...
  // 完整实现见后续步骤
}
```

- [ ] **Step 2: 实现 create / update / remove / detail（连接 CRUD）**

```typescript
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

  this.logger.log(
    `Bitable connection created: ${body.name} (${inserted.id})`,
  );
  return { id: String(inserted.id) };
}

async update(
  id: string,
  body: CreateBitableConnectionRequest,
  userId: string,
): Promise<{ success: boolean }> {
  const rows = await this.db
    .select({ id: bitableConnection.id })
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
    .set({
      name: body.name,
      appId: body.appId,
      appSecret: encryptSecret(body.appSecret),
      bitableAppToken: body.bitableAppToken,
      tableId: body.tableId,
    })
    .where(eq(bitableConnection.id, id));

  return { success: true };
}

async remove(id: string): Promise<{ success: boolean }> {
  const rows = await this.db
    .select({ id: bitableConnection.id })
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
```

- [ ] **Step 3: 实现 getAccessToken（飞书 API 令牌获取）**

```typescript
private async getAccessToken(
  appId: string,
  appSecretEncrypted: string,
): Promise<string> {
  if (
    this.cachedToken &&
    Date.now() < this.cachedToken.expiresAt - 60_000
  ) {
    return this.cachedToken.token;
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

  this.cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + data.expire * 1000,
  };

  return data.tenant_access_token;
}
```

- [ ] **Step 4: 实现 fetchBitableRecords（拉取多维表格数据）**

```typescript
private async fetchBitableRecords(
  appToken: string,
  tableId: string,
  accessToken: string,
): Promise<
  Array<{ record_id: string; fields: Record<string, unknown> }>
> {
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
```

- [ ] **Step 5: 实现 parseRow 和 validateRow（行解析与校验）**

```typescript
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
    .select({ id: employee.id })
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
```

- [ ] **Step 6: 实现 importEmployees（核心导入逻辑）**

```typescript
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
      ),
    )
    .limit(1);

  if (connRow.length === 0) {
    throw new NotFoundException('连接不存在');
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
          await this.db
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
              status: (row.status as 'active' | 'inactive') || existing[0].status,
              supervisorId:
                row.supervisorId || existing[0].supervisorId,
            })
            .where(eq(employee.id, existing[0].id));
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
                  eq(employeeBinding.status, 'active'),
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
          const values = {
            id: row.employeeNo!,
            name: row.name!,
            position: row.position!,
            employeeNo: row.employeeNo!,
            department: row.department || '',
            title: row.title || null,
            role: row.role || 'employee',
            phone: row.phone || null,
            hireDate: row.hireDate ? new Date(row.hireDate) : null,
            status: (row.status as 'active' | 'inactive') || 'active',
            supervisorId: row.supervisorId || null,
            bitableConnectionId: connectionId,
          };

          await this.db.insert(employee).values(values as any);
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
              row.employeeNo!,
              templateMap.get(row.templateName)!,
              now,
              userId,
            );
          }
        }
      } catch (err) {
        failedCount++;
        const reason =
          err instanceof Error ? err.message : String(err);
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
    const errorMessage =
      err instanceof Error ? err.message : String(err);
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
    throw err;
  }
}
```

- [ ] **Step 7: 实现 exportEmployees（推送回多维表格）**

```typescript
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
      ),
    )
    .limit(1);

  if (connRow.length === 0) {
    throw new NotFoundException('连接不存在');
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
          sql`${employee.bitableConnectionId}::uuid = ${connectionId}::uuid`,
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

    for (const emp of employees) {
      try {
        const fields: Record<string, unknown> = {};
        if (emp.name) fields[reverseMap['name']] = emp.name;
        if (emp.employeeNo)
          fields[reverseMap['employeeNo']] = emp.employeeNo;
        if (emp.position)
          fields[reverseMap['position']] = emp.position;
        if (emp.department)
          fields[reverseMap['department']] = emp.department;
        if (emp.title) fields[reverseMap['title']] = emp.title;
        if (emp.role) fields[reverseMap['role']] = emp.role;
        if (emp.phone) fields[reverseMap['phone']] = emp.phone;
        if (emp.hireDate) {
          fields[reverseMap['hireDate']] =
            emp.hireDate instanceof Date
              ? emp.hireDate.toISOString().substring(0, 10)
              : emp.hireDate;
        }
        if (emp.status) fields[reverseMap['status']] = emp.status;

        // 查找多维表格中是否已有工号匹配的行
        const existingRecords = await this.fetchBitableRecords(
          appToken,
          tableId,
          token,
        );
        const matched = existingRecords.find(
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
        const reason =
          err instanceof Error ? err.message : String(err);
        details.push({
          row: syncedCount + failedCount,
          employeeNo: emp.employeeNo || '',
          name: emp.name,
          status: 'failed',
          reason,
        });
        this.logger.error(
          `Export employee ${emp.name} failed: ${reason}`,
        );
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

    return {
      success: status === 'success',
      connectionId,
      totalCount: employees.length,
      syncedCount,
      failedCount,
      logId: String(logRow.id),
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
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
    throw err;
  }
}
```

- [ ] **Step 8: 实现 getLogs 和 getLogDetail（日志查询）**

```typescript
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
        operatorName: sql<string>`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${bitableSyncLog.operatorId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
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
      operatorName: sql<string>`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${bitableSyncLog.operatorId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
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
```

- [ ] **Step 9: 创建测试文件**

```typescript
// server/modules/bitable-connection/bitable-connection.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BitableConnectionService } from './bitable-connection.service';

describe('BitableConnectionService', () => {
  let service: BitableConnectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitableConnectionService,
        { provide: 'DRIZZLE_DATABASE', useValue: {} },
        { provide: 'EmployeeBindingService', useValue: {} },
        { provide: 'RoleManagerService', useValue: {} },
      ],
    }).compile();

    service = module.get<BitableConnectionService>(
      BitableConnectionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseRow', () => {
    it('should map bitable column names to system fields', () => {
      const fields = {
        '姓名': '张三',
        '工号': 'E001',
        '岗位': '工程师',
      };
      const result = (service as any).parseRow(fields);
      expect(result.name).toBe('张三');
      expect(result.employeeNo).toBe('E001');
      expect(result.position).toBe('工程师');
    });
  });

  describe('validateRow', () => {
    it('should reject rows missing name', () => {
      const row = { employeeNo: 'E001', position: '工程师' };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBe('缺少姓名');
    });

    it('should reject rows missing employeeNo', () => {
      const row = { name: '张三', position: '工程师' };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBe('缺少工号');
    });

    it('should pass valid rows', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
      };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBeNull();
    });

    it('should reject invalid departments', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
        department: '不存在的部门',
      };
      const result = (service as any).validateRow(
        row,
        new Set(['研发部']),
        new Map(),
      );
      expect(result).toContain('不存在');
    });

    it('should reject invalid template names', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
        templateName: '不存在的模板',
      };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toContain('不存在');
    });
  });
});
```

- [ ] **Step 10: 运行测试**

```bash
cd /Users/rychuan/CodingFarmer/tangshang_360 && npx jest --testPathPattern="bitable-connection" --passWithNoTests 2>&1 || true
```

- [ ] **Step 11: 提交**

```bash
git add server/modules/bitable-connection/
git commit -m "feat: add BitableConnectionService with import/export logic and tests"
```

---

### Task 4: BitableConnectionController 与 Module

**Files:**
- Create: `server/modules/bitable-connection/bitable-connection.controller.ts`
- Create: `server/modules/bitable-connection/bitable-connection.module.ts`
- Modify: `server/app.module.ts`

**Interfaces:**
- Consumes: `BitableConnectionService`（from Task 3）
- Produces: REST endpoints under `/api/bitable-connections`

- [ ] **Step 1: 创建控制器**

```typescript
// server/modules/bitable-connection/bitable-connection.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { BitableConnectionService } from './bitable-connection.service';
import type {
  BitableConnectionListResponse,
  BitableConnectionItem,
  CreateBitableConnectionRequest,
  BitableSyncLogListResponse,
  BitableSyncLogDetail,
  BitableImportResponse,
  BitableExportResponse,
} from '@shared/api.interface';

@Controller('api/bitable-connections')
export class BitableConnectionController {
  constructor(private readonly service: BitableConnectionService) {}

  @CanRole(['admin', 'hrd'])
  @Get()
  async list(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableConnectionListResponse> {
    return this.service.list({
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
    });
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.service.remove(id);
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id')
  async detail(
    @Param('id') id: string,
  ): Promise<BitableConnectionItem> {
    return this.service.detail(id);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post(':id/import')
  async importEmployees(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<BitableImportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.importEmployees(id, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post(':id/export')
  async exportEmployees(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<BitableExportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.exportEmployees(id, userId);
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id/logs')
  async getLogs(
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableSyncLogListResponse> {
    return this.service.getLogs(id, {
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
    });
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id/logs/:logId')
  async getLogDetail(
    @Param('id') id: string,
    @Param('logId') logId: string,
  ): Promise<BitableSyncLogDetail> {
    return this.service.getLogDetail(id, logId);
  }
}
```

- [ ] **Step 2: 创建模块**

```typescript
// server/modules/bitable-connection/bitable-connection.module.ts
import { Module } from '@nestjs/common';
import { BitableConnectionController } from './bitable-connection.controller';
import { BitableConnectionService } from './bitable-connection.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [EmployeeManagementModule, RoleManagerModule],
  controllers: [BitableConnectionController],
  providers: [BitableConnectionService],
})
export class BitableConnectionModule {}
```

- [ ] **Step 3: 注册到 app.module.ts**

In `server/app.module.ts`, add:

```typescript
// 导入
import { BitableConnectionModule } from './modules/bitable-connection/bitable-connection.module';

// 在 imports 数组中，EmployeeSnapshotModule 之后、ViewModule 之前添加：
BitableConnectionModule,
```

- [ ] **Step 4: 提交**

```bash
git add server/modules/bitable-connection/bitable-connection.controller.ts server/modules/bitable-connection/bitable-connection.module.ts server/app.module.ts
git commit -m "feat: add BitableConnection controller, module, and app registration"
```

---

### Task 5: 前端 API 客户端

**Files:**
- Create: `client/src/api/bitable-connection.ts`

- [ ] **Step 1: 创建 API 客户端**

```typescript
// client/src/api/bitable-connection.ts
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  BitableConnectionListResponse,
  BitableConnectionItem,
  CreateBitableConnectionRequest,
  BitableSyncLogListResponse,
  BitableSyncLogDetail,
  BitableImportResponse,
  BitableExportResponse,
} from '@shared/api.interface';

export async function list(params: {
  page?: number;
  pageSize?: number;
}): Promise<BitableConnectionListResponse> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-connections',
    method: 'GET',
    params,
  });
  return data;
}

export async function detail(
  id: string,
): Promise<BitableConnectionItem> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'GET',
  });
  return data;
}

export async function create(
  body: CreateBitableConnectionRequest,
): Promise<{ id: string }> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-connections',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function update(
  id: string,
  body: CreateBitableConnectionRequest,
): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'PUT',
    data: body,
  });
  return data;
}

export async function remove(
  id: string,
): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'DELETE',
  });
  return data;
}

export async function importEmployees(
  id: string,
): Promise<BitableImportResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/import`,
    method: 'POST',
  });
  return data;
}

export async function exportEmployees(
  id: string,
): Promise<BitableExportResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/export`,
    method: 'POST',
  });
  return data;
}

export async function getLogs(
  id: string,
  params: { page?: number; pageSize?: number },
): Promise<BitableSyncLogListResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/logs`,
    method: 'GET',
    params,
  });
  return data;
}

export async function getLogDetail(
  connectionId: string,
  logId: string,
): Promise<BitableSyncLogDetail> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${connectionId}/logs/${logId}`,
    method: 'GET',
  });
  return data;
}
```

- [ ] **Step 2: 提交**

```bash
git add client/src/api/bitable-connection.ts
git commit -m "feat: add bitable connection API client"
```

---

### Task 6: BitableConnectionDialog 组件

**Files:**
- Create: `client/src/pages/EmployeeManagement/BitableConnectionDialog.tsx`

- [ ] **Step 1: 创建连接表单对话框**

```tsx
// client/src/pages/EmployeeManagement/BitableConnectionDialog.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type {
  BitableConnectionItem,
  CreateBitableConnectionRequest,
} from '@shared/api.interface';

interface BitableConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: BitableConnectionItem | null;
  onSave: (data: CreateBitableConnectionRequest) => Promise<void>;
}

const emptyForm: CreateBitableConnectionRequest = {
  name: '',
  appId: '',
  appSecret: '',
  bitableAppToken: '',
  tableId: '',
};

const BitableConnectionDialog: React.FC<BitableConnectionDialogProps> =
  ({ open, onOpenChange, editing, onSave }) => {
    const [form, setForm] =
      useState<CreateBitableConnectionRequest>(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      if (editing) {
        setForm({
          name: editing.name,
          appId: '',
          appSecret: '',
          bitableAppToken: editing.bitableAppToken,
          tableId: editing.tableId,
        });
      } else {
        setForm(emptyForm);
      }
    }, [editing, open]);

    const handleSave = async () => {
      if (
        !form.name ||
        !form.appId ||
        !form.appSecret ||
        !form.bitableAppToken ||
        !form.tableId
      ) {
        return;
      }
      setSaving(true);
      try {
        await onSave(form);
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? '编辑连接' : '新建连接'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label>连接名称</Label>
              <Input
                placeholder="如：研发部员工表"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>飞书 App ID</Label>
              <Input
                placeholder="cli_xxxxxxxx"
                value={form.appId}
                onChange={(e) =>
                  setForm({ ...form, appId: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>飞书 App Secret</Label>
              <Input
                type="password"
                placeholder={
                  editing ? '留空则不修改' : '输入 App Secret'
                }
                value={form.appSecret}
                onChange={(e) =>
                  setForm({ ...form, appSecret: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>多维表格 App Token</Label>
              <Input
                placeholder="bascnxxxxxxxx"
                value={form.bitableAppToken}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bitableAppToken: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>子表 ID</Label>
              <Input
                placeholder="tblxxxxxxxx"
                value={form.tableId}
                onChange={(e) =>
                  setForm({ ...form, tableId: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

export default BitableConnectionDialog;
```

- [ ] **Step 2: 提交**

```bash
git add client/src/pages/EmployeeManagement/BitableConnectionDialog.tsx
git commit -m "feat: add BitableConnectionDialog component"
```

---

### Task 7: SyncLogDrawer 组件

**Files:**
- Create: `client/src/pages/EmployeeManagement/SyncLogDrawer.tsx`

- [ ] **Step 1: 创建同步日志抽屉**

```tsx
// client/src/pages/EmployeeManagement/SyncLogDrawer.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Download,
  Upload,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import * as api from '@/api/bitable-connection';
import type {
  BitableSyncLogItem,
  BitableSyncLogDetail,
} from '@shared/api.interface';

interface SyncLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
  }
> = {
  success: {
    label: '成功',
    variant: 'default',
    icon: <CheckCircle className="size-3.5" />,
  },
  partial: {
    label: '部分成功',
    variant: 'secondary',
    icon: <AlertTriangle className="size-3.5" />,
  },
  failed: {
    label: '失败',
    variant: 'destructive',
    icon: <XCircle className="size-3.5" />,
  },
};

const rowStatusConfig: Record<
  string,
  { label: string; className: string }
> = {
  created: { label: '新增', className: 'text-green-600' },
  updated: { label: '更新', className: 'text-blue-600' },
  skipped: { label: '跳过', className: 'text-amber-600' },
  failed: { label: '失败', className: 'text-red-600' },
};

const SyncLogDrawer: React.FC<SyncLogDrawerProps> = ({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}) => {
  const [logs, setLogs] = useState<BitableSyncLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] =
    useState<BitableSyncLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (open && connectionId) {
      setLoading(true);
      api
        .getLogs(connectionId, { page: 1, pageSize: 50 })
        .then((res) => setLogs(res.items))
        .finally(() => setLoading(false));
    }
  }, [open, connectionId]);

  const handleSelectLog = async (logId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await api.getLogDetail(connectionId, logId);
      setSelectedLog(detail);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {selectedLog
              ? '日志详情'
              : `同步日志 — ${connectionName}`}
          </SheetTitle>
        </SheetHeader>

        {selectedLog ? (
          <div className="flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLog(null)}
              >
                <ChevronRight className="size-4 rotate-180" />
                返回
              </Button>
              <Badge
                variant={
                  statusConfig[selectedLog.status]?.variant || 'outline'
                }
              >
                {statusConfig[selectedLog.status]?.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-4 p-3 rounded-lg bg-muted/50">
              <div>
                <span className="text-muted-foreground">总计</span>{' '}
                {selectedLog.totalCount}
              </div>
              <div>
                <span className="text-muted-foreground">新增</span>{' '}
                {selectedLog.createdCount}
              </div>
              <div>
                <span className="text-muted-foreground">更新</span>{' '}
                {selectedLog.updatedCount}
              </div>
              <div>
                <span className="text-muted-foreground">跳过</span>{' '}
                {selectedLog.skippedCount}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">失败</span>{' '}
                {selectedLog.failedCount}
              </div>
              {selectedLog.errorMessage && (
                <div className="col-span-2 text-red-600">
                  {selectedLog.errorMessage}
                </div>
              )}
            </div>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">行</TableHead>
                    <TableHead>工号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLog.details.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{d.row}</TableCell>
                      <TableCell>{d.employeeNo}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>
                        <span
                          className={
                            rowStatusConfig[d.status]?.className || ''
                          }
                        >
                          {rowStatusConfig[d.status]?.label ||
                            d.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {d.reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 mt-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">
                暂无同步记录
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {logs.map((log) => (
                  <button
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left w-full"
                    onClick={() => handleSelectLog(log.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {log.direction === 'import' ? (
                        <Download className="size-4 text-blue-500 shrink-0" />
                      ) : (
                        <Upload className="size-4 text-green-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {log.direction === 'import' ? '导入' : '导出'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.startedAt
                            ? new Date(log.startedAt).toLocaleString()
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          statusConfig[log.status]?.variant || 'outline'
                        }
                        className="text-xs"
                      >
                        {statusConfig[log.status]?.label}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default SyncLogDrawer;
```

- [ ] **Step 2: 提交**

```bash
git add client/src/pages/EmployeeManagement/SyncLogDrawer.tsx
git commit -m "feat: add SyncLogDrawer component"
```

---

### Task 8: BitableConnectionTab 主组件

**Files:**
- Create: `client/src/pages/EmployeeManagement/BitableConnectionTab.tsx`

- [ ] **Step 1: 创建主 Tab 组件**

```tsx
// client/src/pages/EmployeeManagement/BitableConnectionTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import {
  Plus,
  Download,
  Upload,
  Pencil,
  Trash2,
  Link2,
  Clock,
  CheckCircle,
  XCircle,
  History,
} from 'lucide-react';
import BitableConnectionDialog from './BitableConnectionDialog';
import SyncLogDrawer from './SyncLogDrawer';
import * as api from '@/api/bitable-connection';
import type {
  BitableConnectionItem,
  CreateBitableConnectionRequest,
} from '@shared/api.interface';

const BitableConnectionTab: React.FC = () => {
  const [connections, setConnections] = useState<
    BitableConnectionItem[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] =
    useState<BitableConnectionItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<BitableConnectionItem | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [logDrawer, setLogDrawer] = useState<{
    connectionId: string;
    connectionName: string;
  } | null>(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list({ page: 1, pageSize: 100 });
      setConnections(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleSave = async (data: CreateBitableConnectionRequest) => {
    if (editing) {
      await api.update(editing.id, data);
    } else {
      await api.create(data);
    }
    await fetchConnections();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.remove(deleteTarget.id);
    setDeleteTarget(null);
    await fetchConnections();
  };

  const handleImport = async (conn: BitableConnectionItem) => {
    setImportingId(conn.id);
    setImportResult(null);
    try {
      const result = await api.importEmployees(conn.id);
      setImportResult({
        created: result.createdCount,
        updated: result.updatedCount,
        skipped: result.skippedCount,
        failed: result.failedCount,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleExport = async (conn: BitableConnectionItem) => {
    setExportingId(conn.id);
    try {
      await api.exportEmployees(conn.id);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4" />共{' '}
          <span className="font-semibold text-foreground">
            {connections.length}
          </span>{' '}
          个连接
        </div>
        <CanRole roles={['admin']}>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            新建连接
          </Button>
        </CanRole>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Link2 className="size-8 opacity-30" />
            <p className="text-sm">
              暂无连接，点击上方按钮创建
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {connections.map((conn) => (
            <Card key={conn.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm">
                        {conn.name}
                      </h4>
                      <Badge
                        variant={
                          conn.isActive ? 'default' : 'secondary'
                        }
                        className="text-xs"
                      >
                        {conn.isActive ? (
                          <CheckCircle className="size-3 mr-0.5" />
                        ) : (
                          <XCircle className="size-3 mr-0.5" />
                        )}
                        {conn.isActive ? '启用' : '停用'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conn.bitableAppToken} / {conn.tableId}
                    </p>
                    {conn.lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="size-3" />
                        最近同步:{' '}
                        {new Date(
                          conn.lastSyncAt,
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <CanRole roles={['admin', 'hrd']}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImport(conn)}
                        disabled={importingId === conn.id}
                      >
                        <Download data-icon="inline-start" />
                        {importingId === conn.id ? '导入中...' : '导入'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExport(conn)}
                        disabled={exportingId === conn.id}
                      >
                        <Upload data-icon="inline-start" />
                        {exportingId === conn.id ? '导出中...' : '导出'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setLogDrawer({
                            connectionId: conn.id,
                            connectionName: conn.name,
                          })
                        }
                        title="同步日志"
                      >
                        <History className="size-4" />
                      </Button>
                    </CanRole>
                    <CanRole roles={['admin']}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(conn);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(conn)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </CanRole>
                  </div>
                </div>
                {importResult && importingId === null && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="text-green-600">
                      新增 {importResult.created}
                    </span>
                    <span className="text-blue-600">
                      更新 {importResult.updated}
                    </span>
                    <span className="text-amber-600">
                      跳过 {importResult.skipped}
                    </span>
                    {importResult.failed > 0 && (
                      <span className="text-red-600">
                        失败 {importResult.failed}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BitableConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除连接</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除连接「{deleteTarget?.name}
              」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {logDrawer && (
        <SyncLogDrawer
          open={!!logDrawer}
          onOpenChange={(open) => !open && setLogDrawer(null)}
          connectionId={logDrawer.connectionId}
          connectionName={logDrawer.connectionName}
        />
      )}
    </div>
  );
};

export default BitableConnectionTab;
```

- [ ] **Step 2: 提交**

```bash
git add client/src/pages/EmployeeManagement/BitableConnectionTab.tsx
git commit -m "feat: add BitableConnectionTab component"
```

---

### Task 9: 集成到 EmployeeManagementPage + EmployeeItem 扩展

**Files:**
- Modify: `client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx`
- Modify: `shared/api.interface.ts`（EmployeeItem 添加 bitableConnectionId）  
- Modify: `server/modules/employee-management/employee-management.service.ts`（list 查询返回 bitableConnectionId）

- [ ] **Step 1: 在 EmployeeItem 中添加 bitableConnectionId**

In `shared/api.interface.ts`, modify `EmployeeItem` interface — 在 `currentBinding` 字段之后添加：

```typescript
bitableConnectionId?: string | null;
```

- [ ] **Step 2: 在后端 list 查询中添加 bitableConnectionId**

In `server/modules/employee-management/employee-management.service.ts` 的 `list()` 方法中：

1. 在 `select` 中添加 `bitableConnectionId: employee.bitableConnectionId`
2. 在 `mapped` 映射中添加 `bitableConnectionId: item.bitableConnectionId || null`

- [ ] **Step 3: 修改 EmployeeManagementPage 添加 Tab**

```tsx
// EmployeeManagementPage.tsx — 完整修改后内容
import React from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { PageHeader } from '@/components/business-ui/page-header';
import EmployeeListTab from './EmployeeListTab';
import DepartmentManagementTab from './DepartmentManagementTab';
import BitableConnectionTab from './BitableConnectionTab';
import { UserCog } from 'lucide-react';

const EmployeeManagementPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="员工管理" icon={UserCog} />
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger
            value="employees"
            className="text-xs sm:text-sm"
          >
            员工列表
          </TabsTrigger>
          <TabsTrigger
            value="departments"
            className="text-xs sm:text-sm"
          >
            部门管理
          </TabsTrigger>
          <TabsTrigger
            value="bitable"
            className="text-xs sm:text-sm"
          >
            多维表格连接
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-4">
          <EmployeeListTab />
        </TabsContent>
        <TabsContent value="departments" className="mt-4">
          <DepartmentManagementTab />
        </TabsContent>
        <TabsContent value="bitable" className="mt-4">
          <BitableConnectionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmployeeManagementPage;
```

- [ ] **Step 4: 提交**

```bash
git add shared/api.interface.ts server/modules/employee-management/employee-management.service.ts client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx
git commit -m "feat: integrate bitable connection tab into employee management"
```

---

### Task 10: 构建验证与修复

**Files:**
- 无新建，验证所有已修改文件

- [ ] **Step 1: 类型检查**

```bash
cd /Users/rychuan/CodingFarmer/tangshang_360 && npm run type:check 2>&1
```
Expected: 类型检查通过。如有错误逐一修复。

- [ ] **Step 2: 构建验证**

```bash
cd /Users/rychuan/CodingFarmer/tangshang_360 && npm run build 2>&1
```
Expected: 构建成功。如有错误逐一修复。

- [ ] **Step 3: 提交修复（如有）**

```bash
git add -A
git commit -m "chore: fix type and build issues"
```

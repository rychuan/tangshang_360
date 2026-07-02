# 多维表格员工导入/双向同步 设计文档

**日期**: 2026-06-30
**状态**: 待实现

## 1. 需求概述

为绩效考评系统增加从飞书多维表格（Bitable）导入员工的功能，支持：

- 通过飞书开放平台 API 连接多维表格
- 按固定列名约定从多维表格导入员工
- 将系统内的员工基本信息推送回多维表格
- 持久化记录连接配置，追溯数据来源
- 记录完整的同步操作日志

## 2. 决策记录

| 维度 | 决策 | 理由 |
|------|------|------|
| 连接方式 | 飞书开放平台 API（app_id + app_secret） | 项目已基于飞书生态（@lark-apaas/*），自然衔接 |
| 同步触发 | 手动触发（按钮点击） | 简单可控，避免实时同步的复杂度 |
| 字段映射 | 固定列名约定 | 减少用户配置负担 |
| 冲突处理 | 多维表格为准（覆盖系统数据） | 多维表格作为主数据源 |
| 身份匹配 | 工号（employeeNo）作为唯一键 | 工号在组织内唯一，比姓名可靠 |
| 反向同步 | 仅基本信息 | 考核数据不适合在表格中管理 |

## 3. 数据库设计

### 3.1 新增表：`bitable_connection`

多维表格连接配置表。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | uuid | PK, not null | 连接唯一标识 |
| `name` | varchar(100) | not null | 连接名称（如「研发部员工表」） |
| `app_id` | varchar(100) | not null | 飞书应用 App ID |
| `app_secret` | text | not null | 飞书应用 App Secret（加密存储） |
| `bitable_app_token` | varchar(200) | not null | 多维表格的 app_token |
| `table_id` | varchar(200) | not null | 目标子表 ID |
| `is_active` | boolean | not null, default true | 是否启用 |
| `_created_by` | userProfile | | 创建人（系统字段） |
| `_created_at` | customTimestamptz | not null | 创建时间（系统字段） |
| `_updated_at` | customTimestamptz | not null | 更新时间（系统字段） |
| `_updated_by` | userProfile | | 更新人（系统字段） |
| `deleted_at` | customTimestamptz | | 软删除 |

### 3.2 新增表：`bitable_sync_log`

同步操作日志表。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | uuid | PK, not null | 日志 ID |
| `connection_id` | uuid | FK → bitable_connection.id, not null | 关联连接 |
| `direction` | varchar(20) | not null | import / export |
| `status` | varchar(20) | not null | success / partial / failed |
| `total_count` | integer | default 0 | 总计处理行数 |
| `created_count` | integer | default 0 | 新增数量 |
| `updated_count` | integer | default 0 | 更新数量 |
| `skipped_count` | integer | default 0 | 跳过数量 |
| `failed_count` | integer | default 0 | 失败数量 |
| `details` | jsonb | | 详细结果（每条记录的处理状态和原因） |
| `error_message` | text | | 整体错误信息 |
| `operator_id` | userProfile | not null | 操作人 |
| `started_at` | customTimestamptz | not null | 开始时间 |
| `completed_at` | customTimestamptz | | 完成时间 |

### 3.3 现有表修改：`employee`

新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `bitable_connection_id` | uuid | nullable | 记录该员工来源于哪个多维表格连接 |

## 4. 字段映射约定

多维表格列名与系统字段的固定映射：

| 多维表格列名 | 系统字段 | 必填 | 校验规则 |
|-------------|---------|------|---------|
| 姓名 | `name` | ✅ | |
| 工号 | `employeeNo` | ✅ | 唯一匹配键 |
| 岗位 | `position` | ✅ | 自由文本，不校验 |
| 部门 | `department` | | 查 `department` 表校验名称存在性，不存在则跳过 |
| 上级工号 | — | | 通过工号查 `employee` 表获取 supervisorId |
| 职位 | `title` | | |
| 角色 | `role` | | 必须是合法值（admin/hrd/dept_head/supervisor/employee） |
| 手机 | `phone` | | |
| 入职日期 | `hireDate` | | |
| 状态 | `status` | | active/inactive |
| 考核模板 | — | | 查 `assessmentTemplate` 表按名称解析 ID，导入后自动创建绑定 |

### 字段存储策略（结论）

**不迁移为外键**。`employee.department` 和 `employee.position` 保持 varchar 存储，不改 FK。理由：

- 改动波及面过大（列表、筛选、统计、创建/编辑等数十处），超出导入功能边界
- `position` 无字典表，需先建表建 CRUD，是独立功能
- 导入时做名称校验即可保证数据质量

### 考核模板自动绑定

导入时如果多维表格行指定了「考核模板」列：

1. 按模板名称查 `assessmentTemplate` 表获取 `templateId`
2. 模板不存在 → 跳过该行并记录原因
3. 模板存在 → 导入后自动调用 `bindingService.batchBind()` 为该员工创建模板绑定
4. 更新已有员工时：仅在该员工当前无活跃绑定时自动绑定，已有绑定不改动

## 5. API 设计

### 5.1 连接管理

```text
GET    /api/bitable-connections           # 列表（支持分页）
POST   /api/bitable-connections           # 创建连接
PUT    /api/bitable-connections/:id       # 编辑连接
DELETE /api/bitable-connections/:id       # 删除连接（软删除）
```

**权限**：仅 `admin`

### 5.2 同步操作

```text
POST   /api/bitable-connections/:id/import    # 从多维表格导入员工
POST   /api/bitable-connections/:id/export    # 推送员工到多维表格
```

**权限**：`admin` 和 `hrd`

### 5.3 日志查询

```text
GET    /api/bitable-connections/:id/logs       # 同步日志列表
GET    /api/bitable-connections/:id/logs/:logId # 日志详情
```

**权限**：`admin` 和 `hrd`

### 5.4 请求/响应类型

```typescript
// 创建/编辑连接
interface CreateBitableConnectionRequest {
  name: string;
  appId: string;
  appSecret: string;
  bitableAppToken: string;
  tableId: string;
}

interface BitableConnectionItem {
  id: string;
  name: string;
  bitableAppToken: string;
  tableId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BitableConnectionListResponse {
  items: BitableConnectionItem[];
  total: number;
}

// 同步结果
interface BitableSyncLogItem {
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

interface BitableSyncLogDetail extends BitableSyncLogItem {
  details: Array<{
    row: number;
    employeeNo: string;
    name: string;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

interface BitableSyncLogListResponse {
  items: BitableSyncLogItem[];
  total: number;
}
```

## 6. 导入流程

```
1. 校验连接配置 → 获取飞书 tenant_access_token
2. 调用 Bitable API GET /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records
   分页拉取全部行
3. 按固定列名映射解析每行数据
4. 逐行校验：
   a. 必填字段（姓名、工号、岗位）缺失 → 跳过
   b. 部门非空 → 查 department 表校验存在性 → 不存在则跳过
   c. 角色非空 → 校验合法性 → 不合法则跳过
   d. 考核模板非空 → 查 assessmentTemplate 表 → 不存在则跳过
   e. 上级工号非空 → 查 employee 表按工号解析 supervisorId
5. 按工号匹配系统已有员工：
   - 找到 → UPDATE 更新字段（保留已有 bitableConnectionId 和绑定关系）
   - 未找到 → INSERT 新增员工，设置 bitableConnectionId
6. 新增员工时自动调用 roleManagerService.addUserToEmployeeRole()
7. 考核模板自动绑定：
   - 新增员工 + 指定模板 → 调用 bindingService.batchBind() 创建绑定
   - 更新已有员工 + 指定模板 + 员工当前无活跃绑定 → 创建绑定
   - 更新已有员工 + 已有活跃绑定 → 跳过绑定操作
8. 记录 audit_log 和 bitable_sync_log
9. 返回操作结果摘要
```

## 7. 导出流程

```
1. 查询该连接关联的所有活跃员工 (bitableConnectionId = :id)
2. 获取飞书 token
3. 先查询多维表格中现有记录，按工号建立索引
4. 遍历系统员工：
   - 表格中存在匹配工号 → PUT 更新行
   - 表格中不存在 → POST 新增行
5. 记录 bitable_sync_log
```

## 8. 前端设计

### 8.1 EmployeeManagementPage 新增 Tab

在现有「员工列表」「部门管理」基础上，新增「多维表格连接」Tab（`BitableConnectionTab`）。

### 8.2 BitableConnectionTab 组件结构

```
BitableConnectionTab
├── 连接列表卡片
│   ├── 每行显示：连接名称、表格 ID、状态标签、最近同步时间
│   ├── 操作按钮：导入 / 导出 / 编辑 / 删除
│   └── 「新建连接」按钮（仅 admin）
├── BitableConnectionDialog（连接表单对话框）
│   ├── 名称、App ID、App Secret、Bitable App Token、Table ID
│   └── 保存时连接测试
└── SyncLogDrawer（同步日志侧边抽屉）
    └── 最近同步记录列表 + 行级详情
```

### 8.3 员工列表增强

来源于多维表格的员工行显示来源标识（飞书图标 + 连接名称 tooltip），点击可跳转到对应连接。

### 8.4 权限
- 连接管理（新建/编辑/删除）：`admin`
- 导入/导出：`admin`、`hrd`

## 9. 安全考虑

- `app_secret` 在数据库中加密存储（使用 AES-256-GCM）
- 飞书 API 调用使用服务端代理，不暴露凭据到前端
- 导入/导出操作记录完整审计日志
- token 在服务端内存缓存（expire 前复用），不落盘

## 10. 技术依赖

- **飞书开放平台 API**：获取 tenant_access_token、Bitable 记录 CRUD
  - `POST /open-apis/auth/v3/tenant_access_token/internal`
  - `GET /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records`
  - `POST /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records`
  - `PUT /open-apis/bitable/v1/apps/:appToken/tables/:tableId/records/:recordId`
- **现有依赖可用**：`@lark-apaas/fullstack-nestjs-core`（DRIZZLE_DATABASE 注入）、`@lark-apaas/client-toolkit`（axiosForBackend、auth）

## 11. 实现文件清单

### 后端（server/modules/bitable-connection/）

```
bitable-connection.module.ts
bitable-connection.controller.ts
bitable-connection.service.ts
```

### 前端

```
client/src/pages/EmployeeManagement/BitableConnectionTab.tsx
client/src/pages/EmployeeManagement/BitableConnectionDialog.tsx
client/src/pages/EmployeeManagement/SyncLogDrawer.tsx
client/src/api/bitable-connection.ts
```

### 共享类型（shared/api.interface.ts）

新增所有 bitable 相关的 request/response 接口。

### 数据库

- `server/database/schema.ts`（通过 `npm run gen:db-schema` 自动生成后新增自定义表）

# 员工管理模块 — 优化调整方案

> 本方案分析当前系统中"员工管理"功能的缺失，并给出从数据库到前端的完整优化建议。

---

## 目录

1. [现状分析](#1-现状分析)
2. [优化目标](#2-优化目标)
3. [数据库层调整](#3-数据库层调整)
4. [后端模块设计（新增 + 调整）](#4-后端模块设计新增--调整)
5. [前端页面设计](#5-前端页面设计)
6. [对其他模块的影响](#6-对其他模块的影响)
7. [实施路径](#7-实施路径)

---

## 1. 现状分析

### 当前员工相关功能的分布

当前系统中员工相关的功能散落在多个模块中，没有一个统一的员工管理入口：

| 模块 | 涉及员工的功能 | 备注 |
|------|---------------|------|
| `employee-binding` | 员工列表（只作为绑定的被选对象） | 通过 `UserSelect` 组件选择 |
| `assessment-publish` | 员工列表（作为发布的被选对象） | Same |
| `team-performance` | 下属员工考核数据 | 以当前用户视角查询下属 |
| `my-assessment` | 当前员工本人的考核记录 | 仅自己 |
| `assessment-statistics` | 全公司员工作为查询维度 | 只读 |
| `assessment-dashboard` | 当前用户待办和概览 | 仅自己 |
| `Layout.tsx` | 获取当前用户头像/名称 | `useCurrentUserProfile()` |

### 缺少的核心能力

#### 缺少独立的员工管理页面

| 缺失项 | 说明 |
|--------|------|
| ❌ 员工列表页 | 没有独立页面管理全公司员工信息 |
| ❌ 员工 CRUD | 无法创建/编辑/禁用员工，依赖飞书平台同步 |
| ❌ 组织架构展示 | 无法查看部门树、汇报关系链 |
| ❌ 员工详情页 | 无法查看单个员工的完整信息、考核历史、绑定历史等 |
| ❌ 批量导入 | 没有 Excel 导入 / 从飞书组织架构同步的能力 |
| ❌ 部门管理 | department 字段是自由文本，没有统一管理 |

#### 员工表字段设计过简

当前 `employee` 表字段：

| 字段 | 类型 | 问题 |
|------|------|------|
| `id` | `user_profile` | 由飞书平台管理 ID |
| `name` | `varchar(255)` | ✅ |
| `position` | `varchar(255)` | 岗位名称自由文本 |
| `department` | `varchar(255)` | 部门名称自由文本 |
| `supervisor_id` | `user_profile` | 上级关系 |
| `status` | `varchar` | 'active' / 'inactive' |

**缺失字段**：
- 入职日期（用于计算试用期截止日、转正考核时间）
- 试用期时长
- 邮箱 / 手机号（与飞书账密解耦时使用）
- 职级（与岗位独立，用于等级阈值、晋升参考）
- 角色（用于区分 HRD / 部门负责人 / 普通员工 / 上级，替代当前"无上级=HRD"的错误推断）
- 员工编号（人力系统标识）

#### 角色判断逻辑有缺陷

当前系统通过"是否有上级"推断角色（`dashboard.service.ts` — `buildShortcuts()`）：
- `supervisorId === null` → 判为 HRD（最高权限）
- 有下属 → 判为上级
- 其他 → 判为普通员工

**问题**：刚入职未分配上级的员工被误判为 HRD。

---

## 2. 优化目标

### 核心目标

1. **建立独立、完整的员工管理模块**，提供员工信息的统一管理入口
2. **完善员工数据模型**，补全核心业务字段
3. **修正角色判定逻辑**，引入显式的角色字段
4. **支持组织架构管理**，包括部门和汇报关系
5. **支持员工批量导入和从飞书同步**
6. **与现有考核全流程无缝集成**

---

## 3. 数据库层调整

### 3.1 employee 表字段扩展

```sql
-- 新增字段
ALTER TABLE employee ADD COLUMN employee_no varchar(64);       -- 员工编号
ALTER TABLE employee ADD COLUMN title varchar(255);            -- 职级 (如 P5/P6/M1/M2)
ALTER TABLE employee ADD COLUMN role varchar(64) DEFAULT 'employee';
   -- 角色: 'hrd' / 'dept_head' / 'supervisor' / 'employee'
ALTER TABLE employee ADD COLUMN hire_date date;                -- 入职日期
ALTER TABLE employee ADD COLUMN probation_months int DEFAULT 3;-- 试用期月数
ALTER TABLE employee ADD COLUMN email varchar(255);            -- 邮箱
ALTER TABLE employee ADD COLUMN phone varchar(32);             -- 手机号
ALTER TABLE employee ADD COLUMN department_id uuid;            -- 关联部门表（替代自由文本）
```

### 3.2 新增部门表 department

```sql
CREATE TABLE department (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         varchar(255) NOT NULL,           -- 部门名称
  parent_id    uuid REFERENCES department(id),   -- 上级部门
  head_id      user_profile,                    -- 部门负责人
  sort_order   int DEFAULT 0,                   -- 排序
  is_active    boolean DEFAULT true,
  _created_at  timestamptz DEFAULT now(),
  _updated_at  timestamptz DEFAULT now()
);
```

### 3.3 新增角色权限配置表（可选扩展）

```sql
CREATE TABLE role_permission (
  role         varchar(64) PRIMARY KEY,  -- 'hrd'/'dept_head'/'supervisor'/'employee'
  permissions  jsonb NOT NULL,           -- 权限集合
  description  varchar(255)
);
```

### 3.4 Drizzle Schema 调整

需要在 `server/database/schema.ts` 中（或通过 `fullstack-cli gen-db-schema` 重新生成）新增 `department` 表，更新 `employee` 表。

由于该文件标识为 `/** auto generated, do not edit */`，需要评估是否可以手动修改或通过 CLI 工具同步。

---

## 4. 后端模块设计（新增 + 调整）

### 4.1 新增 EmployeeManagement 模块

**目录**：`server/modules/employee-management/`

**API 设计**：

#### 4.1.1 员工列表

```
GET /api/employees
Query: page, pageSize, keyword(姓名/编号), departmentId, position, title, role, status
Response: { items: EmployeeItem[], total: number }

EmployeeItem {
  id: string;
  employeeNo: string;
  name: string;
  position: string;
  title: string;           // 职级
  role: string;            // 角色
  department: string;      // 部门名称
  departmentId: string;
  supervisorId: string;
  supervisorName: string;
  status: string;
  email: string;
  phone: string;
  hireDate: string;
}
```

#### 4.1.2 员工详情

```
GET /api/employees/:id
Response: EmployeeDetail (含完整信息 + 统计摘要)

EmployeeDetail {
  ...EmployeeItem,
  probationMonths: number;
  createdAt: string;
  // 统计摘要
  stats: {
    activeBindings: number;        // 当前生效绑定数
    totalAssessments: number;      // 历史考核总数
    completedAssessments: number;  // 已完成考核数
    avgScore?: number;             // 历史平均分
    latestGrade?: string;           // 最近一次考核等级
  }
}
```

#### 4.1.3 创建员工

```
POST /api/employees
Body: {
  employeeNo?: string;
  name: string;
  position: string;
  title?: string;
  role?: string;
  departmentId?: string;
  supervisorId?: string;
  email?: string;
  phone?: string;
  hireDate?: string;
  probationMonths?: number;
}
```

#### 4.1.4 编辑员工

```
PUT /api/employees/:id
Body: 同创建
```

#### 4.1.5 启用/禁用员工

```
PATCH /api/employees/:id/activate
PATCH /api/employees/:id/deactivate
```

禁用员工后的影响：
- 不再出现在可选员工列表中
- 不再生成新的考核实例
- 已有进行中的考核不受影响

#### 4.1.6 部门相关

```
GET /api/departments
GET /api/departments/tree   -- 返回树形结构
POST /api/departments
PUT /api/departments/:id
DELETE /api/departments/:id
```

#### 4.1.7 批量导入

```
POST /api/employees/import
Content-Type: multipart/form-data
Body: Excel 文件 (xlsx)
```

导入逻辑：
- 解析 Excel（列：姓名/岗位/部门/上级/职级/角色/邮箱/入职日期）
- 逐行校验并写入
- 返回导入结果（成功数/失败数/失败详情）

#### 4.1.8 从飞书同步（如平台支持）

```
POST /api/employees/sync-from-lark
```

从飞书组织架构自动同步员工数据，更新部门、上级关系等。

#### 4.1.9 组织架构树

```
GET /api/employees/org-chart?rootDepartmentId=
Response: {
  departments: [
    { id, name, children: [sub-departments], members: [员工列表] }
  ]
}
```

### 4.2 调整 Dashboard 的角色判断逻辑

**位置**：`assessment-dashboard.service.ts` — `buildShortcuts()`

**当前逻辑**（错误）：
```typescript
const isHRD = empRows.length === 0 || empRows[0].supervisorId === null;
```

**改为**：
```typescript
// 优先使用 role 字段判定
if (empRow.role === 'hrd') {
  return HRD快捷操作;
}
// 其次根据是否有下属判定是否为上级
const subCount = 查询下属数量;
if (subCount > 0) {
  return 上级快捷操作;
}
// 最后为普通员工
return 员工快捷操作;
```

### 4.3 调整其他模块中的用户查询

当前多个 service 中直接通过 `req.userContext.userId` 获取用户信息，可以使用新的 `GET /api/employees/profile` 接口获取当前用户的完整信息（含 role）。

### 4.4 共享类型补充

在 `shared/api.interface.ts` 中新增：

```typescript
// === Employee Management ===
export interface EmployeeItem {
  id: string;
  employeeNo: string;
  name: string;
  position: string;
  title: string;
  role: 'hrd' | 'dept_head' | 'supervisor' | 'employee';
  department: string;
  departmentId: string;
  supervisorId: string;
  supervisorName: string;
  status: 'active' | 'inactive';
  email: string;
  phone: string;
  hireDate: string;
}

export interface EmployeeDetail extends EmployeeItem {
  probationMonths: number;
  createdAt: string;
  stats: {
    activeBindings: number;
    totalAssessments: number;
    completedAssessments: number;
    avgScore?: number;
    latestGrade?: string;
  };
}

export interface EmployeeListResponse {
  items: EmployeeItem[];
  total: number;
}

export interface CreateEmployeeRequest {
  employeeNo?: string;
  name: string;
  position: string;
  title?: string;
  role?: string;
  departmentId?: string;
  supervisorId?: string;
  email?: string;
  phone?: string;
  hireDate?: string;
  probationMonths?: number;
}

export interface DepartmentItem {
  id: string;
  name: string;
  parentId?: string;
  headId?: string;
  headName?: string;
  memberCount: number;
  sortOrder: number;
}

export interface DepartmentTreeNode extends DepartmentItem {
  children: DepartmentTreeNode[];
}

export interface ImportResult {
  totalRows: number;
  successCount: number;
  failCount: number;
  failures: Array<{ row: number; reason: string }>;
}
```

---

## 5. 前端页面设计

### 5.1 新增「员工管理」路由

| 路由 | 页面 | 层级 |
|------|------|------|
| `/employees` | 员工管理首页（列表） | 一级 |
| `/employees/:id` | 员工详情 | 二级 |
| `/employees/import` | 批量导入 | 二级 |
| `/department` | 部门管理 | 一级 |
| `/department/tree` | 组织架构图 | 二级 |

### 5.2 导航栏调整

在 `Layout.tsx` 的 `navItems` 中增加：

```typescript
const navItems = [
  { label: '首页', path: '/', icon: LayoutDashboard },
  { label: '我的考核', path: '/my-assessments', icon: ClipboardList },
  { label: '员工管理', path: '/employees', icon: Users },          // 新增
  { label: '考核模板管理', path: '/template-management', icon: FileText },
  { label: '员工模板绑定', path: '/employee-binding', icon: UserCheck },
  { label: '考核发布管理', path: '/publish-management', icon: Send },
  { label: '考核统计查询', path: '/statistics', icon: BarChart3 },
  { label: '团队绩效', path: '/team-performance', icon: Users },
];
```

> 注意：`Layout.tsx` 当前行数是 1796，已在 500 行左右。建议将导航配置、角色判断等逻辑抽离到独立配置文件中。

### 5.3 员工列表页（`EmployeeListPage.tsx`）

**功能**：
- 员工表格列表（分页，多条件筛选）
- 筛选条件：姓名/编号关键词、部门树选、岗位、职级、角色、状态
- 批量操作：批量启用/禁用、批量绑定模板
- 单行操作：编辑、详情、禁用/启用、删除（软删除）
- 顶部操作栏：新建员工、批量导入、从飞书同步

**示意布局**：
```
┌─────────────────────────────────────────────────┐
│  员工管理                           [+新建] [导入] │
├─────────────────────────────────────────────────┤
│  [搜索框] [部门 ▼] [岗位 ▼] [角色 ▼] [状态 ▼] 搜索 │
├─────────────────────────────────────────────────┤
│  ☐ 姓名 | 编号 | 部门 | 岗位 | 职级 | 角色 | 上级 | 状态 | 操作 │
│  ☐ 张三 | 001  | 技术部 | 前端 | P5  | 员工 | 李四 | ✅   | ✏️  |
│  ☐ 李四 | 002  | 技术部 | 组长 | M1  | 上级 | 王五 | ✅   | ✏️  │
├─────────────────────────────────────────────────┤
│  共 120 条                           1  2  3  ... │
└─────────────────────────────────────────────────┘
```

### 5.4 员工详情页（`EmployeeDetailPage.tsx`）

**功能区块**：

```
┌─────────────────────────────────────────────────┐
│  ← 返回  张三                                     │
├─────────────────────────────────────────────────┤
│  ┌─ 基本信息 ───────────────────────────────┐    │
│  │  姓名: 张三    编号: 001    部门: 技术部    │    │
│  │  岗位: 前端开发  职级: P5   角色: 员工      │    │
│  │  上级: 李四    入职: 2024-01-15          │    │
│  │  邮箱: xxx    手机: 138...               │    │
│  │  状态: ✅ 已启用              [编辑] [禁用] │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─ 考核统计 ───────────────────────────────┐    │
│  │  历史考核: 12次  已完成: 10次  进行中: 2次   │    │
│  │  平均分: 85.2  最近等级: A                 │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─ 考核记录 ───────────────────────────────┐    │
│  │  2025-06 | 85.2 | A | 已完成 | 查看 >     │    │
│  │  2025-05 | 82.0 | B | 已完成 | 查看 >     │    │
│  │  ...                                    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌─ 绑定历史 ───────────────────────────────┐    │
│  │  2025-01 ~ 至今 | 前端考核模板 | 已绑定     │    │
│  │  2024-07 ~ 2024-12 | 前端试用模板 | 已过期  │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 5.5 批量导入页（`EmployeeImportPage.tsx`）

**功能**：
- 上传 Excel 文件
- 预览解析结果
- 确认导入并显示结果

### 5.6 部门管理与组织架构（`DepartmentPage.tsx`）

**功能**：
- 部门 CRUD（树形结构管理）
- 部门树可视化展示
- 设置部门负责人
- 查看部门下的员工列表

---

## 6. 对其他模块的影响

### 6.1 需要调整的现有模块

| 模块 | 调整内容 | 影响程度 |
|------|---------|---------|
| **Layout.tsx** | 增加员工管理导航项，超过 500 行需要拆分 | 中 |
| **Dashboard** | 角色判断逻辑改用新的 `role` 字段 | 低 |
| **Dashboard** | 概览数据按角色返回不同范围 | 中 |
| **EmployeeBinding** | 员工选择改用员工管理的数据源 | 低 |
| **EmployeeBinding** | 绑定表中展示员工编号/部门等更多信息 | 低 |
| **AssessmentPublish** | 员工列表改用员工管理的数据源 | 低 |
| **TeamPerformance** | 下属查询可扩展为支持按部门筛选 | 中 |
| **AssessmentStatistics** | 部门筛选改为使用 department_id | 低 |
| **app.module.ts** | 注册新模块 | 低 |

### 6.2 无需调整的模块

| 模块 | 理由 |
|------|------|
| AssessmentTemplate | 与员工无关 |
| AssessmentOperation | 操作流程不依赖员工管理数据 |
| MyAssessment | 个人视角，不涉及员工列表 |
| ViewModule | SPA 路由转发，不涉及数据 |

---

## 7. 实施路径

### 第一阶段：基础能力（核心 MVP）

| # | 任务 | 产出 |
|---|------|------|
| 1 | 扩展 employee 表字段（employee_no, title, role, hire_date, probation_months, email, phone） | 数据库迁移脚本 |
| 2 | 修正 HRD 角色判定逻辑 | 修改 `dashboard.service.ts` |
| 3 | 实现员工 CRUD 后端（列表/详情/创建/编辑/启用禁用） | `employee-management` 模块 |
| 4 | 实现员工列表页（含筛选、分页） | 前端页面 |
| 5 | 实现员工新建/编辑弹窗 | 前端组件 |
| 6 | 注册路由、导航栏、app.module | 集成 |
| 7 | 将现有模块（绑定/发布/统计）中的用户数据源指向新模块 | 集成 |

**预计工作量**：3-5 天

### 第二阶段：组织架构管理

| # | 任务 | 产出 |
|---|------|------|
| 1 | 创建 department 表 | 数据库迁移 |
| 2 | 部门 CRUD 后端 | 后端 API |
| 3 | 部门树展示 | 前端页面 |
| 4 | 员工详情页（含考核统计聚合） | 前端页面 |
| 5 | 将员工表 department 字段改为关联 department_id | 数据迁移 |

**预计工作量**：2-3 天

### 第三阶段：高级功能

| # | 任务 | 产出 |
|---|------|------|
| 1 | Excel 批量导入员工 | 后端解析 + 前端上传页面 |
| 2 | 飞书组织架构同步（如平台支持） | 能力适配 |
| 3 | 组织架构图可视化 | 前端组件 |
| 4 | Dashboard 按角色展示不同概览范围 | Dashboard 扩展 |

**预计工作量**：2-4 天

---

## 附录：关键设计决策

### A. 为什么不直接使用飞书组织架构？

飞书平台提供了 `user_profile` 类型和用户系统，但当前方案决定在应用中建立独立的员工表，原因：

1. **数据本地化**：考核系统需要为员工设置试用期、职级等飞书不包含的属性
2. **过程独立性**：员工禁用/离职后，考核系统需要保留历史数据且不再生成新考核
3. **解耦**：不依赖飞书组织架构的实时可用性

飞书组织架构可以作为数据源之一（一键同步），但不是唯一来源。

### B. 为什么 role 字段要用显式枚举而非推导？

当前系统通过"有无上级"推导角色，事实证明这个逻辑不可靠。使用显式 `role` 字段的好处：

1. **确定性强**：不会出现误判
2. **灵活配置**：一个人可以既是 supervisor（有下属）又有上级
3. **可追溯**：审计日志中记录角色变更

### C. 部门采用树形结构还是扁平？

建议采用**树形结构**（parent_id 自引用），原因：

1. 支持多层级组织架构（公司 → BU → 部门 → 小组）
2. 部门负责人可以看整个子树的考核数据
3. 灵活支持未来组织调整

---

> **总结**：当前系统缺乏独立的员工管理模块，员工数据模型过于简化，角色判定逻辑有缺陷。建议以"独立员工管理模块"为核心，分三个阶段推进：基础 CRUD（含角色修正）→ 组织架构管理 → 批量导入与飞书同步。

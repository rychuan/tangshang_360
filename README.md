# 绩效考评系统

企业级绩效考评管理系统，支持月度考核和试用期考核全流程管理，覆盖考核模板配置、员工绑定、考核发布、自评/上级评分、结果统计等完整业务闭环。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui (Radix UI) |
| 后端 | NestJS 10 + TypeScript + Drizzle ORM |
| 数据库 | PostgreSQL |
| 构建 | Vite (前端) + NestJS CLI (后端) |
| 包管理 | npm >= 10.0.0 |
| 运行时 | Node.js >= 22.0.0 |

## 项目结构

```
tangshang_360/
├── client/                     # 前端应用（React + Vite）
│   ├── index.html              # 入口 HTML（Handlebars 模板）
│   └── src/
│       ├── api/                # API 客户端层（按模块划分）
│       ├── app.tsx             # 路由定义 + ProtectedRoute 角色守卫
│       ├── components/
│       │   ├── Layout.tsx      # 全局布局
│       │   ├── ProtectedRoute.tsx  # 权限路由组件
│       │   ├── business-ui/    # 业务领域组件
│       │   └── ui/             # shadcn/ui 基础组件（Radix UI）
│       ├── hooks/              # 自定义 Hooks
│       ├── pages/              # 页面组件
│       │   ├── AssessmentDetail/
│       │   ├── Department/
│       │   ├── EmployeeManagement/
│       │   ├── GradeConfig/
│       │   ├── HomePage/
│       │   ├── MyAssessments/
│       │   ├── PublishManagement/
│       │   ├── Statistics/
│       │   └── TemplateManagement/
│       └── utils/
├── server/                     # 后端应用（NestJS）
│   ├── app.module.ts           # 根模块
│   ├── main.ts                 # 入口文件（端口 3000）
│   ├── capabilities/           # 平台能力配置
│   ├── common/
│   │   ├── constants/          # 响应码常量
│   │   ├── filters/            # GlobalExceptionFilter（BusinessException）
│   │   └── interfaces/         # API 响应接口
│   ├── database/
│   │   └── schema.ts           # Drizzle ORM 数据库 Schema（自动生成）
│   └── modules/                # 业务模块（见下方模块说明）
├── shared/
│   ├── api.interface.ts        # 前后端共享类型定义（API 契约）
│   └── plugin-types.ts         # 插件类型
├── scripts/                    # 构建/开发脚本
│   ├── build.sh                # 生产构建流程
│   ├── dev.sh                  # 开发环境入口
│   ├── dev-local.js            # 本地开发
│   ├── dev.js                  # 沙箱开发
│   ├── prune-smart.js          # 依赖裁剪
│   └── run.sh                  # 生产运行脚本
├── package.json                # 前后端统一依赖管理（monorepo 风格）
├── tsconfig.json               # TypeScript 配置入口
├── tsconfig.app.json           # 前端 TS 配置
├── tsconfig.node.json          # 后端 TS 配置
├── vite.config.ts              # Vite 构建配置
├── nest-cli.json               # NestJS CLI 配置
├── tailwind.config.ts          # Tailwind CSS 配置
├── components.json             # shadcn/ui 配置
└── .env                        # 环境变量
```

## 后端模块概览

| 模块 | 路径 | 功能说明 |
|------|------|----------|
| `assessment-dashboard` | `server/modules/assessment-dashboard` | 考核仪表盘 - 数据汇总与可视化 |
| `assessment-template` | `server/modules/assessment-template` | 考核模板 - 维度+指标的 CRUD |
| `team-structure` | `server/modules/team-structure` | 团队结构 - 团队与员工绑定关系 |
| `assessment-publish` | `server/modules/assessment-publish` | 考核发布 - 发布考核并批量生成实例 |
| `assessment-operation` | `server/modules/assessment-operation` | 考核操作 - 解锁/签名/评分 |
| `assessment-statistics` | `server/modules/assessment-statistics` | 考核统计 - 排名与统计分析 |
| `my-assessment` | `server/modules/my-assessment` | 我的考核 - 个人考核列表与详情 |
| `team-performance` | `server/modules/team-performance` | 团队绩效 - 团队维度的绩效查看 |
| `department` | `server/modules/department` | 部门管理 - 树形部门 CRUD |
| `employee-management` | `server/modules/employee-management` | 员工管理 - 员工 CRUD 与绑定管理 |
| `role-manager` | `server/modules/role-manager` | 角色管理 - 角色权限配置 |
| `performance-grade` | `server/modules/performance-grade` | 绩效等级 - S/A/B/C 等级配置 |
| `employee-snapshot` | `server/modules/employee-snapshot` | 员工快照 - 员工级指标快照的生成/调整/删除/复制 |

## 数据库表

| 表名 | 说明 |
|------|------|
| `employee` | 员工（id 为 `user_profile` 类型，通过 `((id).user_id)` 唯一索引标识） |
| `department` | 部门（树形结构，支持 `parent_id` 自引用） |
| `assessment_template` | 考核模板 |
| `assessment_dimension` | 考核维度（属于模板） |
| `assessment_indicator` | 考核指标（属于维度） |
| `assessment_instance` | 考核实例（员工 + 考核周期） |
| `assessment_indicator_snapshot` | 实例级指标快照（属于实例，评分时使用） |
| `employee_indicator_snapshot` | 员工级指标快照（属于员工，发布时复制到实例级快照） |
| `employee_binding` | 员工-模板绑定关系 |
| `rating_record` | 评分记录（自评/上级评分） |
| `role_permission_config` | 角色权限配置 |
| `performance_grade` | 绩效等级（S/A/B/C） |
| `audit_log` | 审计日志 |

## 考核流程

```
绑定模板 ──→ 发布考核 ──→ 自评 (self_review) ──→ 上级评分 (supervisor_review) ──→ 完成 (completed)
```

关键约定：
- **员工级快照**：员工绑定模板时自动生成，支持调整/删除。发布时复制到实例级快照。
- **实例级快照**：发布后生成，评分操作基于实例级快照进行。
- **调整指标**：在待发布区域操作员工级快照，不影响已发布实例。

## 权限模型

使用 `@CanRole` 装饰器进行角色鉴权，支持以下角色：

| 角色 | 代码 | 说明 |
|------|------|------|
| 管理员 | `admin` | 系统最高权限 |
| HRD | `hrd` | 人力资源总监 |
| 部门负责人 | `dept_head` | 部门管理权限 |
| 上级 | `supervisor` | 下属考核评分 |
| 员工 | `employee` | 个人考核查看与自评 |

权限矩阵定义在 `shared/api.interface.ts` 的 `DEFAULT_PERMISSIONS` 中。

## 快速开始

### 环境要求

- Node.js >= 22.0.0
- npm >= 10.0.0
- PostgreSQL 数据库

### 环境变量

复制 `.env` 文件并配置数据库连接：

```bash
cp .env .env.local
```

`.env` 主要配置项：

```env
# 数据库连接
SUDA_DATABASE_URL=postgresql://user:password@localhost:5432/assessment

# 服务器配置（默认 localhost:3000）
SERVER_HOST=0.0.0.0

# 日志
LOG_REQUEST_BODY=true
LOG_RESPONSE_BODY=true
```

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
# 同时启动前后端（推荐）
npm run dev

# 仅启动后端
npm run dev:server

# 仅启动前端
npm run dev:client
```

后端运行在 `http://localhost:3000`，前端开发服务器通过 Vite 代理。

### 生成数据库 Schema

```bash
npm run gen:db-schema
```

该命令从数据库同步生成 `server/database/schema.ts`（Drizzle ORM Schema）。

### 类型检查

```bash
# 前后端同时类型检查
npm run type:check

# 仅后端
npm run type:check:server

# 仅前端
npm run type:check:client
```

### 代码质量

```bash
# ESLint
npm run eslint

# Stylelint
npm run stylelint

# Prettier 格式化
npm run format

# 综合 Lint
npm run lint
```

### 构建与部署

```bash
# 完整构建（前后端）
npm run build

# 仅前端
npm run build:client

# 仅后端
npm run build:server

# 生产构建
npm run build:prod
```

## 路径别名

| 别名 | 映射路径 | 用途 |
|------|----------|------|
| `@/` | `client/src/` | 前端源码 |
| `@client/` | `client/` | 客户端根目录 |
| `@server/` | `server/` | 服务端根目录 |
| `@shared/` | `shared/` | 共享类型定义 |

## 前后端共享类型

`shared/api.interface.ts` 是前后端 API 契约的核心文件，包含：

- 所有 API 接口的请求/响应类型定义
- `DEFAULT_PERMISSIONS` 权限矩阵（5 种角色 × 各资源操作）
- 角色代码、资源标签等常量定义

## 注意事项

1. **`employee` 表 `id` 字段**为 `user_profile` 自定义类型，非 UUID 主键，通过 `((id).user_id)` 唯一索引标识。
2. **考核实例的状态流转**：`self_review → supervisor_review → completed`，不可逆向（除非通过解锁操作）。
3. **指标快照的两层设计**：员工级快照用于模板绑定后的预配置调整阶段；实例级快照在发布时生成，用于实际评分流程。
4. **NestJS 的 `nest-cli.json`** 中 `deleteOutDir` 必须为 `false`，否则构建流程中的路由生成步骤会被清空。
5. **平台特性**：项目基于妙搭（Spark/Miaoda）平台，使用 `@lark-apaas/*` 生态工具链。

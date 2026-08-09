# 绩效考评系统

## 项目概述

企业级绩效考评管理系统，支持月度考核和试用期考核全流程管理，包括考核模板配置、员工绑定、考核发布、自评/上级评分、结果统计等功能。

## 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- 后端：NestJS 10 + TypeScript + Drizzle ORM
- 数据库：PostgreSQL
- 构建：Rspack

## 后端模块

| 模块                  | 路径                                 | 功能                              |
| --------------------- | ------------------------------------ | --------------------------------- |
| assessment-dashboard  | server/modules/assessment-dashboard  | 考核仪表盘数据汇总                |
| assessment-template   | server/modules/assessment-template   | 考核模板 CRUD（维度+指标）        |
| team-structure        | server/modules/team-structure        | 团队结构与员工绑定关系            |
| assessment-publish    | server/modules/assessment-publish    | 考核发布与批量生成实例            |
| assessment-operation  | server/modules/assessment-operation  | 考核操作（评分/签名/签名会话）    |
| assessment-statistics | server/modules/assessment-statistics | 考核统计与排名                    |
| my-assessment         | server/modules/my-assessment         | 个人考核列表与详情                |
| team-performance      | server/modules/team-performance      | 团队绩效查看                      |
| department            | server/modules/department            | 部门树 CRUD                       |
| employee-management   | server/modules/employee-management   | 员工 CRUD、绑定管理与授权同步     |
| role-manager          | server/modules/role-manager          | 角色权限配置与授权一致性          |
| performance-grade     | server/modules/performance-grade     | 绩效等级配置（S/A/B/C）           |
| employee-snapshot     | server/modules/employee-snapshot     | 员工级指标快照生成/调整/删除/复制 |
| system-dict           | server/modules/system-dict           | 系统字典（岗位/职级等）           |
| view                  | server/modules/view                  | SPA 兜底路由（必须最后注册）      |

## 数据库表

| 表名                          | 说明                                       |
| ----------------------------- | ------------------------------------------ |
| employee                      | 员工（id 为 user_profile 类型）            |
| department                    | 部门（树形结构）                           |
| assessment_template           | 考核模板                                   |
| assessment_dimension          | 考核维度（属模板）                         |
| assessment_indicator          | 考核指标（属维度）                         |
| assessment_instance           | 考核实例（员工+周期）                      |
| assessment_indicator_snapshot | 实例级指标快照（属实例，评分时用）         |
| employee_indicator_snapshot   | 员工级指标快照（属员工，发布时复制到实例） |
| employee_binding              | 员工-模板绑定关系                          |
| rating_record                 | 评分记录（自评/上级评分）                  |
| role_permission_config        | 角色权限配置                               |
| performance_grade             | 绩效等级                                   |
| audit_log                     | 审计日志                                   |
| assessment_sign_session       | 签名一次性会话（token 仅存 hash，5 分钟 TTL）|
| authorization_sync_job        | 授权同步任务（pending → processing → succeeded/failed）|
| system_dict                   | 系统字典数据（岗位/职级等下拉）            |
| bitable_connection/sync_log   | 已废弃（功能已下线）；清理迁移 `018_drop_bitable_legacy.sql` 已就绪，待平台库执行后跑 `npm run gen:db-schema` 同步 schema.ts |

## 权限模型

### 细粒度资源权限（主鉴权方式）

- 业务接口统一使用 `@RequirePermission(resource, action)` 装饰器 + `@NeedLogin()`，由全局 `PermissionsGuard` 校验（`RoleManagerService.checkUserPermission`）。
- 资源/动作枚举定义在 `shared/types/permission.types.ts`（含 `DEFAULT_PERMISSIONS` 角色默认矩阵）。
- 用户拥有多个角色时取权限并集；非 admin 用户还需是有效员工（`hasActiveEmployee`）才放行。
- 权限配置变更走 `upsertPermissionConfig`，写后立即失效配置缓存（5 分钟 TTL 兜底）。

### 角色身份鉴权（仅限提权操作）

- `@CanRole([...])` 为平台角色级身份门，**仅用于 `role-manager.controller.ts`**（角色 CRUD、权限配置变更等提权操作），业务接口不要使用。
- 角色包括：admin、hrd、dept_head、supervisor、employee。

### 授权同步模型

- employee 表带 `authorizationRoles`（jsonb 期望角色）、`authorizationStatus`（pending/synced/failed）、`authorizationVersion`。
- 角色变更 → `stageAuthorizationChange`（写期望角色+建任务）→ `AuthorizationSyncService.processEmployeeAuthorization`（SDK 同步+校验）→ `reconcileUserRoles`。
- 角色判定优先走 AuthorizationSDK（`roles.list({ userID })` 一次调用判定全部角色），仅当 SDK 判定无角色且本地已 synced 时降级回退本地 `role` 列（fails closed）。

## 关键约定

- employee 表 id 为 user_profile 类型，非 UUID 主键，通过 `((id).user_id)` 唯一索引标识
- 考核流程状态：self_review → supervisor_review → completed（主链）；分离签名流程会经过 pending_sign（本人签名）/ supervisor_sign（上级签名），评分+签名一步到位模式则跳过中间态
- 员工级指标快照：绑定模板时自动生成，可调整/删除，发布时复制到实例级快照
- 调整指标操作在待发布区域，修改员工级快照，不影响已发布实例
- shared/api.interface.ts 为前后端共享类型定义；shared/types/ 存放分类类型（permission/assessment/error）
- server/common/ 包含自定义异常过滤器（BusinessException）、响应码常量、全局 PermissionsGuard、签名会话工具
- 签名 token：32 字节随机 hex，DB 只存 SHA-256 hash，5 分钟 TTL，`FOR UPDATE` 行锁保证一次性消费，签名操作落 audit_log
- 布局：页面不要写 `calc(100svh-...)` 魔法数字，统一使用 `PageShell` 组件（business-ui）承载滚动与高度级联
- 控制器 `@RequirePermission` 与 `@NeedLogin()` 成对出现；自助端点（my-roles/my-permissions/bootstrap/sign-session 状态）仅 `@NeedLogin()` 不加资源权限

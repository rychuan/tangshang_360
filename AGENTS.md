# 绩效考评系统

## 项目概述

企业级绩效考评管理系统，支持月度考核和试用期考核全流程管理，包括考核模板配置、员工绑定、考核发布、自评/上级评分、结果统计等功能。

## 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- 后端：NestJS 10 + TypeScript + Drizzle ORM
- 数据库：PostgreSQL
- 构建：Rspack

## 后端模块

| 模块 | 路径 | 功能 |
|------|------|------|
| assessment-dashboard | server/modules/assessment-dashboard | 考核仪表盘数据汇总 |
| assessment-template | server/modules/assessment-template | 考核模板 CRUD（维度+指标） |
| team-structure | server/modules/team-structure | 团队结构与员工绑定关系 |
| assessment-publish | server/modules/assessment-publish | 考核发布与批量生成实例 |
| assessment-operation | server/modules/assessment-operation | 考核操作（解锁/签名/评分） |
| assessment-statistics | server/modules/assessment-statistics | 考核统计与排名 |
| my-assessment | server/modules/my-assessment | 个人考核列表与详情 |
| team-performance | server/modules/team-performance | 团队绩效查看 |
| department | server/modules/department | 部门树 CRUD |
| employee-management | server/modules/employee-management | 员工 CRUD 与绑定管理 |
| role-manager | server/modules/role-manager | 角色权限配置 |
| performance-grade | server/modules/performance-grade | 绩效等级配置（S/A/B/C） |
| employee-snapshot | server/modules/employee-snapshot | 员工级指标快照生成/调整/删除/复制 |

## 数据库表

| 表名 | 说明 |
|------|------|
| employee | 员工（id 为 user_profile 类型） |
| department | 部门（树形结构） |
| assessment_template | 考核模板 |
| assessment_dimension | 考核维度（属模板） |
| assessment_indicator | 考核指标（属维度） |
| assessment_instance | 考核实例（员工+周期） |
| assessment_indicator_snapshot | 实例级指标快照（属实例，评分时用） |
| employee_indicator_snapshot | 员工级指标快照（属员工，发布时复制到实例） |
| employee_binding | 员工-模板绑定关系 |
| rating_record | 评分记录（自评/上级评分） |
| role_permission_config | 角色权限配置 |
| performance_grade | 绩效等级 |
| audit_log | 审计日志 |

## 权限模型

使用 `@CanRole` 装饰器进行角色鉴权，角色包括：admin、hrd、dept_head、supervisor、employee。

## 关键约定

- employee 表 id 为 user_profile 类型，非 UUID 主键，通过 `((id).user_id)` 唯一索引标识
- 考核流程状态：self_review → supervisor_review → completed
- 员工级指标快照：绑定模板时自动生成，可调整/删除，发布时复制到实例级快照
- 调整指标操作在待发布区域，修改员工级快照，不影响已发布实例
- shared/api.interface.ts 为前后端共享类型定义
- server/common/ 包含自定义异常过滤器（BusinessException）和响应码常量

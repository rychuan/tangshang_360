# 绩效考核系统 - AGENTS.md

## 项目概述

基于 NestJS + React 全栈的绩效考核管理系统，支持考核模板配置、员工绑定、月度考核发布、自评/上级评分、签名确认、数据统计查询。

## 设计规范

- 主题变量：`client/src/tailwind-theme.css` — 沉稳深蓝主色，Sharp 圆角（2px），无阴影，标准间距
- 组件使用规范：`docs/UI组件使用规范.md` — 指标卡、按钮、卡片、表单、表格等组件的标准用法与禁止写法
- 全局页面容器由 Layout 统一提供 `p-6`，页面组件内部禁止重复添加 `p-6`

## 路由

| 路由 | 页面 | 文件 |
|------|------|------|
| `/` | 首页/考核概览 | `client/src/pages/HomePage/HomePage.tsx` |
| `/template-management` | 考核模板管理 | `client/src/pages/TemplateManagement/TemplateManagementPage.tsx` |
| `/employees` | 员工管理（含部门管理） | `client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx` |
| `/employees/:id` | 员工详情 | `client/src/pages/EmployeeManagement/EmployeeDetailPage.tsx` |
| `/permissions` | 权限管理 | `client/src/pages/EmployeeManagement/PermissionPage.tsx` |
| `/publish-management` | 考核发布管理 | `client/src/pages/PublishManagement/PublishManagementPage.tsx` |
| `/assessment/:id` | 考核详情/操作 | `client/src/pages/AssessmentDetail/AssessmentDetailPage.tsx` |
| `/statistics` | 考核统计查询 | `client/src/pages/Statistics/StatisticsPage.tsx` |
| `/my-assessments` | 我的考核 | `client/src/pages/MyAssessments/MyAssessmentsPage.tsx` |
| `/team-performance` | 团队绩效 | `client/src/pages/TeamPerformance/TeamPerformancePage.tsx` |
| `/grade-config` | 绩效等级配置 | `client/src/pages/GradeConfig/GradeConfigPage.tsx` |

## 服务端模块

| 模块 | 目录 | 职责 |
|------|------|------|
| AssessmentDashboard | `server/modules/assessment-dashboard/` | 待办任务、概览数据 |
| AssessmentTemplate | `server/modules/assessment-template/` | 模板CRUD、停用 |
| EmployeeManagement | `server/modules/employee-management/` | 员工CRUD、部门树下拉、模板绑定/解绑/历史 |
| Department | `server/modules/department/` | 部门树CRUD |
| TeamStructure | `server/modules/team-structure/` | 原员工管理查询接口（历史兼容） |
| AssessmentPublish | `server/modules/assessment-publish/` | 发布、调整、解锁 |
| AssessmentOperation | `server/modules/assessment-operation/` | 自评、上级评分、签名 |
| AssessmentStatistics | `server/modules/assessment-statistics/` | 查询、统计、导出 |
| MyAssessment | `server/modules/my-assessment/` | 个人考核记录、趋势、汇总 |
| TeamPerformance | `server/modules/team-performance/` | 团队概览、下属列表、催办 |
| PerformanceGrade | `server/modules/performance-grade/` | 绩效等级配置CRUD、等级匹配 |

## 共享类型

`shared/api.interface.ts` — 前后端共享的 API 请求/响应类型定义，按模块分组。

## 前端 API

`client/src/api/index.ts` — 按模块命名空间导出：
- `dashboard` → `client/src/api/dashboard.ts`
- `assessmentTemplate` → `client/src/api/assessment-template.ts`
- `employeeManagement` → `client/src/api/employee-management.ts`
- `department` → `client/src/api/department.ts`
- `teamStructure` → `client/src/api/team-structure.ts`（历史兼容）
- `assessmentPublish` → `client/src/api/assessment-publish.ts`
- `assessmentOperation` → `client/src/api/assessment-operation.ts`
- `assessmentStatistics` → `client/src/api/assessment-statistics.ts`
- `myAssessment` → `client/src/api/my-assessment.ts`
- `teamPerformance` → `client/src/api/team-performance.ts`
- `performanceGrade` → `client/src/api/performance-grade.ts`

## 布局

- 侧边导航：shadcn/ui Sidebar，桌面端可折叠，移动端 Sheet 弹出
- 面包屑：Header 区域显示当前页面标题
- 用户：Sidebar Footer 展示当前用户信息，支持退出登录

## 编码约定

- NestJS MVCS 架构，Controller + Service 模式
- Drizzle ORM + PostgreSQL 数据库
- 前端使用 Tailwind CSS + shadcn/ui 组件
- 前后端共享类型通过 `shared/api.interface.ts`
- 页面文件 ≤ 500 行，组件文件 ≤ 300 行
# 绩效模板删除功能 设计文档

**日期**: 2026-07-01
**状态**: 待实现

## 1. 需求

在「绩效模板管理」模块增加模板删除功能。

## 2. 决策

| 维度 | 决策 |
|------|------|
| 删除方式 | 软删除（`deleted_at` 字段标记） |
| 权限 | admin + hrd，使用 `template_management` 资源的 `delete` action（已存在） |
| 关联处理 | 级联停用绑定关系，保留维度/指标/实例数据 |

## 3. 数据库

`assessment_template` 表新增 `deleted_at` 字段（customTimestamptz, nullable）。

## 4. 后端

- Service: 新增 `delete(id, userId)` → 软删除 + 停用绑定 + 审计日志
- Service: `list()` 增加 `isNull(deletedAt)` 过滤
- Controller: `DELETE /:id`

## 5. 前端

- API Client: 新增 `remove(id)` 函数
- TemplateManagementPage: 新增「删除」按钮（仅已停用模板），确认对话框

## 6. 文件清单

- 修改: `server/modules/assessment-template/assessment-template.service.ts`
- 修改: `server/modules/assessment-template/assessment-template.controller.ts`
- 修改: `client/src/api/assessment-template.ts`
- 修改: `client/src/pages/TemplateManagement/TemplateManagementPage.tsx`

# 数据库迁移执行指南

> 平台数据库环境手动执行。迁移文件**不会**由应用自动执行，需要人工按顺序在平台库执行后，
> 重新运行 `npm run gen:db-schema` 同步 `server/database/schema.ts`（schema.ts 由真实库生成，
> 迁移落地后会自动带上新增/删除的表、列与索引声明）。

## 执行总流程

```
1. 平台数据库环境按编号顺序执行待执行迁移（见下方清单）
2. 执行 `npm run gen:db-schema` 同步 schema.ts
3. 提交 schema.ts 变更 + 已执行迁移的标注
```

## 待执行迁移清单（按编号顺序，有依赖关系不可乱序）

| 迁移 | 内容 | 依赖说明 |
|---|---|---|
| `018_drop_bitable_legacy.sql` | 清理 Bitable 遗留对象（bitable_connection / bitable_sync_log 表、employee.bitable_connection_id 列） | 独立；幂等（IF EXISTS） |
| `019_backfill_employee_department_id.sql` | 存量员工按部门名称回填 department_id | **必须先于 020**（依赖 employee.department 名称列） |
| `020_drop_employee_department_name.sql` | 删除 employee.department 名称列 | 依赖 019 先回填；执行前校验无依赖对象 |
| `021_cleanup_stale_authorization_jobs.sql` | 清理孤儿授权同步任务（旧版本残留的 pending/processing） | 独立；BEGIN/COMMIT 包裹，幂等 |
| `022_employee_department_index.sql` | 为 employee.department_id 补索引（dept_head 数据范围过滤） | 独立；幂等（IF NOT EXISTS） |
| `023_bonus_dimension.sql` | 绩效加减分维度：assessment_dimension 增加 is_bonus/description；两张指标快照表增加 is_bonus | 独立；幂等（IF NOT EXISTS） |

## 执行后验证

以 022 为例（其余迁移按各自文件内验证说明）：

```sql
-- 1. 索引已建
SELECT indexname FROM pg_indexes
WHERE tablename = 'employee' AND indexname = 'idx_employee_department';

-- 2. 计划确认走索引（替换为你真实的部门 ID）
EXPLAIN ANALYZE
SELECT (employee_id).user_id FROM employee
WHERE department_id IN ('<dept-1>', '<dept-2>')
  AND deleted_at IS NULL AND status = true;
```

## 已执行迁移的标注约定

- 迁移在平台库执行后，在本清单中把该行标记为 ✅（或在迁移文件头注释追加"已执行"标记），
  避免重复执行与遗漏；
- 所有迁移均设计为幂等（IF EXISTS / IF NOT EXISTS / 可重复 UPDATE），重复执行不会报错，
  但应避免依赖顺序错乱。

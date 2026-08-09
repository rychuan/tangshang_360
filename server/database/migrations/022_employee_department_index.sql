-- 为 employee.department_id 补索引
--
-- 背景：
--   dept_head 数据范围按 employee.department_id 过滤（AccessScope 的 departmentCondition，
--   `employee.department_id IN (负责部门ID)`），团队绩效、仪表盘、发布、统计等模块
--   每次请求都会执行该 IN 查询。此前 employee 表只有 supervisor_id 与 employee_id 索引，
--   department_id 过滤会走全表扫描，员工量增大后成为瓶颈。
--
-- 执行方式：在平台数据库环境手动执行本文件，执行后跑 `npm run gen:db-schema` 同步 schema.ts。
--
-- 安全说明：
--   - 幂等（IF NOT EXISTS），可重复执行；
--   - department_id 为可空列，btree 索引不包含 NULL，不影响现有查询。

CREATE INDEX IF NOT EXISTS idx_employee_department ON employee (department_id);

-- 回填 employee.department_id：存量员工按部门名称关联 department.id
--
-- 背景：
--   006_employee_department_id.sql 仅新增了 department_id 列，未做任何回填，
--   存量员工 department_id 全为 NULL。AccessScope（dept_head 数据权限）与
--   员工列表部门筛选按 department_id 判定归属，NULL 会导致部门负责人
--   看不到本部门老员工、部门成员弹窗计数与列表不一致。
--
-- 执行方式：在平台数据库环境手动执行本文件。
--
-- 安全说明：
--   - 仅回填 department_id IS NULL 且未删除的员工；
--   - 按部门名称精确匹配（部门名称唯一，create 已校验）；
--   - 可重复执行，已回填的记录不会被覆盖。

UPDATE employee e
SET department_id = d.id
FROM department d
WHERE e.department_id IS NULL
  AND e.deleted_at IS NULL
  AND e.department = d.name;

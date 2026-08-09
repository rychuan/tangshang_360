-- 删除 employee.department 名称列（历史遗留信息）
--
-- 背景：
--   employee 表历史同时维护 department（部门名称，NOT NULL）与 department_id（uuid 关联
--   department.id）两个部门键，长期存在双键不一致风险。本次改造后：
--   - department_id 为唯一权威关联键（AccessScope 数据权限、列表筛选、统计、发布均按它关联）；
--   - 部门名称展示改为经 department_id 联查 department.name；
--   - 所有读写 employee.department 的代码已全部移除。
--
-- 执行方式：在平台数据库环境手动执行本文件。
--
-- 安全说明：
--   - DROP COLUMN 前先校验不再有依赖对象（索引/约束/视图），存在则中止；
--   - 可在事务内执行，失败自动回滚；
--   - 执行后需同步刷新 server/database/schema.ts（如已同步则无需操作）。

BEGIN;

DO $$
DECLARE
  dependent_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO dependent_count
  FROM pg_depend d
  JOIN pg_class c ON d.objid = c.oid
  JOIN pg_attribute a
    ON a.attrelid = d.refobjid
   AND a.attnum = d.refobjsubid
  WHERE c.relname = 'employee'
    AND a.attname = 'department'
    AND d.deptype IN ('n', 'a', 'i');
  IF dependent_count > 0 THEN
    RAISE EXCEPTION 'employee.department 存在 % 个依赖对象（索引/约束），中止删除', dependent_count;
  END IF;
END $$;

ALTER TABLE employee DROP COLUMN IF EXISTS department;

COMMIT;

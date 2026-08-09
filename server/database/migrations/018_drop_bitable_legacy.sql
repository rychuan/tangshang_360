-- 清理 Bitable 连接遗留对象（Bitable 功能已整体下线）
--
-- 背景：
--   提交 e5c0746 删除了全部 Bitable 前后端代码，但数据库中的
--   bitable_connection / bitable_sync_log 表和 employee.bitable_connection_id 列
--   仍然存在（server/database/schema.ts 为自动生成，仍映射这些对象）。
--
-- 执行方式：在平台数据库环境手动执行本文件后，重新运行 `npm run gen:db-schema`
--   以同步 server/database/schema.ts（删除 bitable 表与列映射）。
--
-- 安全说明：
--   - 所有 DROP 均带 IF EXISTS，可重复执行；
--   - 删除列前先检查是否存在依赖对象（索引/约束），存在则中止，避免误删；
--   - 全程在单个事务内执行，失败自动回滚。

BEGIN;

-- 1. 校验 employee.bitable_connection_id 无依赖对象
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
    AND a.attname = 'bitable_connection_id'
    AND d.deptype IN ('n', 'a'); -- normal / auto 依赖（索引、约束等）

  IF dependent_count > 0 THEN
    RAISE EXCEPTION
      'Cannot drop employee.bitable_connection_id: % dependent object(s) exist',
      dependent_count;
  END IF;
END $$;

-- 2. 删除列
ALTER TABLE employee DROP COLUMN IF EXISTS bitable_connection_id;

-- 3. 删除表（先日志表，后连接表）
DROP TABLE IF EXISTS bitable_sync_log;
DROP TABLE IF EXISTS bitable_connection;

COMMIT;

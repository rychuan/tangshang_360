-- 绩效加减分维度支持
--
-- 背景：
--   绩效模板新增「加减分项」：一个特殊的维度（无指标，仅维度名称+说明），
--   不在权重 100% 校验范围内，评分支持负分，分数直接加入绩效总分。
--   加减分维度在快照层（员工级/实例级）表现为一行维度级快照（is_bonus=true），
--   评分复用 rating_record（score 允许负数，comment 承载员工/上级说明）。
--
-- 变更：
--   1. assessment_dimension          增加 is_bonus（加减分标记）、description（维度说明）
--   2. employee_indicator_snapshot   增加 is_bonus（快照行标记）
--   3. assessment_indicator_snapshot 增加 is_bonus（快照行标记）
--
-- 执行方式：在平台数据库环境手动执行本文件，执行后跑 `npm run gen:db-schema` 同步 schema.ts。
-- 完整迁移执行清单与依赖顺序见 `server/database/migrations/README.md`。
--
-- 安全说明：
--   - 幂等（IF NOT EXISTS），可重复执行；
--   - 历史数据默认 is_bonus=false，行为完全不变。

ALTER TABLE assessment_dimension
  ADD COLUMN IF NOT EXISTS is_bonus boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE employee_indicator_snapshot
  ADD COLUMN IF NOT EXISTS is_bonus boolean NOT NULL DEFAULT false;

ALTER TABLE assessment_indicator_snapshot
  ADD COLUMN IF NOT EXISTS is_bonus boolean NOT NULL DEFAULT false;

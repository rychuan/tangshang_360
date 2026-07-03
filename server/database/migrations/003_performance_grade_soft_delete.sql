-- 为 performance_grade 表添加软删除支持
ALTER TABLE performance_grade ADD COLUMN deleted_at TIMESTAMPTZ;

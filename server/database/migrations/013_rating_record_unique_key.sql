-- 为评分记录增加业务唯一键，防止同一实例、指标、评分类型出现重复记录。
-- 如历史数据已有重复，保留更新时间最新的一条。
DELETE FROM rating_record rr
USING rating_record newer
WHERE rr.instance_id = newer.instance_id
  AND rr.indicator_snapshot_id = newer.indicator_snapshot_id
  AND rr.rating_type = newer.rating_type
  AND (
    rr._updated_at < newer._updated_at
    OR (rr._updated_at = newer._updated_at AND rr.id < newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_unique_instance_snapshot_type
  ON rating_record (instance_id, indicator_snapshot_id, rating_type);

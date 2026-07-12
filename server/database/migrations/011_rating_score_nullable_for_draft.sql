-- 草稿评分允许暂不填写分数，避免空分数被保存为 0 分。
ALTER TABLE rating_record
  ALTER COLUMN score DROP NOT NULL,
  ALTER COLUMN score DROP DEFAULT;

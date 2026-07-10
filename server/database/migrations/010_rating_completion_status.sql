-- 员工自评时填写的指标完成情况，保留长文本、换行和空格
ALTER TABLE rating_record ADD COLUMN completion_status TEXT;

-- 将 employee.role 从 varchar(50) 改为 text，支持逗号分隔多角色
ALTER TABLE employee ALTER COLUMN role TYPE TEXT;

-- 为 employee 表增加 position_code 逻辑外键，指向 system_dict.code (dictType='position')
ALTER TABLE employee ADD COLUMN position_code VARCHAR(100);
CREATE INDEX idx_employee_position_code ON employee(position_code);

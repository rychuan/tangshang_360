-- 为 employee 表增加 department_id 逻辑外键，指向 department.id
ALTER TABLE employee ADD COLUMN department_id UUID;
CREATE INDEX idx_employee_department_id ON employee(department_id);

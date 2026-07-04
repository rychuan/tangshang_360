-- 为 employee.role 添加 CHECK 约束，限制可选值
-- 支持单值或逗号分隔多值（如 'admin,hrd'）
ALTER TABLE employee ADD CONSTRAINT chk_employee_role
  CHECK (role IS NULL OR role ~ '^(employee|supervisor|dept_head|hrd|admin)(,(employee|supervisor|dept_head|hrd|admin))*$');

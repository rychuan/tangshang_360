-- 添加考核实例唯一约束：同一员工在同一考核周期内只能有一条记录
-- employee_id 是 user_profile 复合类型，需通过 (employee_id).user_id 访问内部字段
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_instance_employee_period
ON assessment_instance (((employee_id).user_id), period);

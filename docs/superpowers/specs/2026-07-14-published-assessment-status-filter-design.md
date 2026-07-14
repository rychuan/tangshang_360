# 已发布绩效状态筛选优化设计

## 背景

发布管理的“已发布绩效”状态筛选直接暴露了考核实例的底层流程状态：

- `self_review`
- `pending_sign`
- `supervisor_review`
- `supervisor_sign`
- `completed`
- `draft`

实际绩效任务按“员工处理”和“上级处理”两个业务阶段展示。`pending_sign` 与
`supervisor_sign` 是兼容旧签名流程的中间状态，`draft` 不会出现在已发布实例中，
因此当前下拉选项与任务状态口径不一致。

## 目标

状态筛选仅展示以下业务选项：

- 员工处理中
- 上级处理中
- 已完成

其中：

- 员工处理中匹配 `self_review`、`pending_sign`
- 上级处理中匹配 `supervisor_review`、`supervisor_sign`
- 已完成匹配 `completed`

## 设计

前端使用 `employee_processing` 和 `supervisor_processing` 作为组合筛选值。后端在
发布管理查询中将组合值转换为 `OR` 条件。`completed` 以及已有底层单状态参数继续
按精确状态查询，避免破坏已有 API 调用。

列表中的状态徽标仍展示实例的精确流程状态，本次只调整筛选条件，不修改考核流程、
实例状态或评分操作。

## 验证

- 单元测试覆盖组合筛选值到数据库状态数组的映射。
- 类型检查验证前后端调用参数。
- 发布管理下拉框不再展示签名兼容状态和草稿状态。


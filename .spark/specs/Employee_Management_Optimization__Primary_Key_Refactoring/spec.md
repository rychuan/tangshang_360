# 需求分析
## 需求描述
- 员工表结构重构：将employee表中原主键`id`（userProfile类型）重命名为`employee_id`，新增UUID类型的`id`字段作为新主键
  - 验证条件：数据库employee表结构符合设计，原有员工数据完整迁移，新增id字段自动填充唯一UUID值
- 全链路代码适配：修改所有引用`employee.id`的业务代码、关联查询逻辑，确保现有功能无影响
  - 验证条件：员工列表、详情、创建、编辑、模板绑定、考核流程等所有相关功能正常运行，无数据关联错误

# 技术方案
## 技术架构
- 前端：React 19 + TypeScript + Tailwind CSS + shadcn/ui
- 后端：NestJS 10 + TypeScript + Drizzle ORM
- 数据库：PostgreSQL
- 兼容性策略：保持现有API接口请求/响应结构完全不变，前端无感知适配，无需修改前端代码

## 数据模型
### 数据库设计
#### 员工表（employee）
用途：存储员工基础信息
核心字段调整：
- 原`id: userProfile("id").primaryKey()` → 重命名为`employee_id: userProfile("employee_id")`，保留userProfile类型，存储飞书用户唯一标识
- 新增`id: uuid("id").primaryKey().defaultRandom()`，作为新主键，插入时自动生成UUID
- 其余字段（name、position、department等）保持不变
关联关系调整：
- `employee_binding`、`assessment_instance`、`employee_indicator_snapshot`等关联表的`employee_id`字段（userProfile类型）继续关联`employee.employee_id`，无需修改字段类型，最小化变更范围
- 原索引调整：原基于`(id).user_id`的索引调整为基于`(employee_id).user_id`

## 业务模型
### 领域模型
- EmployeeRepository：修改所有`employee.id`字段引用为`employee.employee_id`，调整主键查询、关联查询逻辑适配新字段结构
- EmployeeManagementService：调整员工增删改查、状态变更、权限查询等逻辑的字段映射
- EmployeeBindingService：调整员工存在性校验、绑定/解绑逻辑的字段引用
- 其余涉及`employee.id`引用的模块（团队结构、考核发布、考核操作、统计查询、飞书同步等）同步调整字段引用

### API 设计
#### 员工管理相关
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 员工列表查询 | API | GET /api/employees |
| 员工详情查询 | API | GET /api/employees/:id |
| 创建员工 | API | POST /api/employees |
| 更新员工 | API | PUT /api/employees/:id |
| 员工状态变更 | API | PATCH /api/employees/* |
| 员工模板绑定 | API | POST /api/employees/bind |

**兼容性处理**：所有API保持原有请求/响应结构不变，接口入参的`id`仍接收飞书用户ID，返回结果的`id`仍返回飞书用户ID（映射自`employee_id`字段），前端无需任何修改。

**核心API调整示意**：
```typescript
// 获取员工列表 [领域模型: EmployeeRepository] [对应功能: 员工列表查询]
GET /api/employees?page=1&pageSize=20
Response: {
  items: Array<{
    id: string; // 仍返回飞书用户ID（employee_id），完全兼容原有逻辑
    employeeNo: string;
    name: string;
    position: string;
    // 其余字段保持不变
  }>;
  total: number;
}

// 创建员工 [领域模型: EmployeeManagementService] [对应功能: 创建员工]
POST /api/employees
Request Body: {
  id: string; // 仍接收飞书用户ID，内部映射为employee_id字段
  name: string;
  position: string;
  // 其余字段保持不变
}
Response: {
  id: string; // 仍返回飞书用户ID，完全兼容原有逻辑
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "员工管理核心"
    DB1[employee表: id(uuid) + employee_id(userProfile)] --> M1[EmployeeRepository]
    M1 --> M2[EmployeeManagementService]
    M2 --> API1[员工管理API]
    API1 --> P1[员工管理/团队结构/考核相关页面]
    end
    
    subgraph "关联业务模块"
    DB2[employee_binding/assessment_instance等关联表] --> M3[业务模块服务]
    DB1 --> M3
    M3 --> API2[业务功能API]
    API2 --> P1
    end
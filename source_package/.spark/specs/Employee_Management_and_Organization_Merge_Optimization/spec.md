# 需求分析
## 需求描述
- 员工管理部门选择优化：将员工管理页面中新建/编辑员工的部门自由文本输入改为下拉部门树选择，同时列表页增加部门筛选的部门树选择器
  - 验证条件：部门选择支持树形层级展示，选择后自动回填部门名称，筛选按部门名称过滤员工
- 员工管理支持直接绑定考核模板：在员工管理页面集成考核模板绑定、解绑、绑定历史查询功能，无需通过组织架构页面操作
  - 验证条件：员工列表展示当前绑定的考核模板信息，支持批量/单个绑定模板、解绑、查看绑定历史，操作后数据实时刷新
- 功能合并优化：合并重复的员工管理与组织架构功能，统一以员工管理页面（/employees）为唯一入口，延用员工管理现有UI设计
  - 验证条件：组织架构页面/导航项移除，员工管理页面整合部门管理功能，所有人员组织相关操作可在员工管理页面完成
## 页面列表
### 员工管理页（/employees）
1. 顶部Tab切换：员工列表 / 部门管理
2. 员工列表：支持按部门、角色、状态、关键字筛选，展示员工核心信息及当前绑定模板
3. 新建/编辑员工：表单含部门树下拉选择，支持完整员工信息录入
4. 绑定/解绑考核模板：支持单个/批量员工绑定模板，查看绑定历史
5. 部门管理Tab：展示部门树列表，支持新建/编辑/删除部门
# 技术方案
## 技术架构
- 前端：React 19 + Tailwind CSS + shadcn/ui + Lucide图标
- 后端：NestJS 10 + Drizzle ORM + PostgreSQL
- 复用现有模块：employee-management（员工核心能力）、department（部门树能力）、team-structure（绑定逻辑参考复用）
## 页面路由与导航
### 页面路由
- 原有路由：`/employees` 保留，作为人员管理唯一入口
- 删除路由：`/organization` 及子页面
- 权限管理保留原有独立路由：`/permissions`
### 导航设计
- 导航机制：页面路由
- 导航项：移除原有"组织架构"项，保留"员工管理"项
## 数据模型
### 数据库设计
现有表结构无需新增/修改，复用已有表：
#### 员工表（employee）
用途：存储员工基础信息
核心字段：id、name、position、department、role、status、supervisorId等
关联关系：与employee_binding表一对多
#### 部门表（department）
用途：存储部门树形结构信息
核心字段：id、name、parentId、headId、sortOrder、isActive等
关联关系：自关联树形结构
#### 员工绑定表（employee_binding）
用途：存储员工与考核模板的绑定关系
核心字段：id、employeeId、templateId、effectiveFrom、status等
关联关系：与employee表多对一，与assessment_template表多对一
## 业务模型
### 领域模型
- EmployeeManagementModel：扩展绑定能力，包含员工CRUD、考核模板绑定/解绑/历史查询、列表关联绑定信息
- DepartmentModel：原有部门树CRUD、树形结构生成能力保持不变
### API 设计
#### 员工管理页相关
**页面路径**: /employees
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 员工列表查询 | API | GET /api/employees |
| 新建/编辑员工 | API | POST /api/employees、PUT /api/employees/:id |
| 员工绑定考核模板 | API | POST /api/employees/bind |
| 员工解绑考核模板 | API | PATCH /api/employees/:id/unbind |
| 绑定历史查询 | API | GET /api/employees/:id/binding-history |
| 部门列表查询 | API | GET /api/departments |
| 部门CRUD | API | POST /api/departments、PUT /api/departments/:id、DELETE /api/departments/:id |
**需实现的 API**：
1. 员工列表扩展返回绑定信息
2. 员工绑定考核模板接口
3. 员工解绑考核模板接口
4. 绑定历史查询接口
**所需 API**:
```typescript
// 扩展员工列表查询 [领域模型: EmployeeManagementModel] [对应页面功能: 员工列表展示]
GET /api/employees?page=1&pageSize=20&department=xxx&role=xxx&status=xxx&keyword=xxx
Response: {
  items: Array<{
    id: string;
    name: string;
    employeeNo: string;
    position: string;
    title: string;
    role: string;
    department: string;
    status: string;
    currentBinding: {
      templateId: string;
      templateName: string;
      effectiveFrom: string;
      status: string;
    } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
// 绑定考核模板 [领域模型: EmployeeManagementModel] [对应页面功能: 绑定考核模板]
POST /api/employees/bind
Request Body: {
  employeeIds: string[];
  templateId: string;
  effectiveFrom: string;
}
Response: {
  success: boolean;
}
// 解绑考核模板 [领域模型: EmployeeManagementModel] [对应页面功能: 解绑考核模板]
PATCH /api/employees/:id/unbind
Response: {
  success: boolean;
}
// 查询绑定历史 [领域模型: EmployeeManagementModel] [对应页面功能: 查看绑定历史]
GET /api/employees/:id/binding-history
Response: {
  items: Array<{
    id: string;
    templateName: string;
    effectiveFrom: string;
    status: string;
    createdAt: string;
    operator: string;
  }>;
}
// 已有部门列表接口 [领域模型: DepartmentModel] [对应页面功能: 部门树选择/部门管理]
GET /api/departments
Response: {
  items: Array<DepartmentItem>;
  tree: Array<DepartmentTreeNode>;
}
```
### 数据流转链路图
```mermaid
graph LR
    subgraph "员工管理页-员工列表"
    DB1[employee 表] --> M1[EmployeeManagementModel]
    DB3[employee_binding 表] --> M1
    M1 --> API1[GET /api/employees]
    API1 --> P1[员工列表展示]
    end
    
    subgraph "员工管理页-绑定功能"
    DB3 --> M1
    M1 --> API2[POST /api/employees/bind]
    API2 --> P1
    M1 --> API3[PATCH /api/employees/:id/unbind]
    API3 --> P1
    M1 --> API4[GET /api/employees/:id/binding-history]
    API4 --> P1
    end
    
    subgraph "员工管理页-部门管理"
    DB2[department 表] --> M2[DepartmentModel]
    M2 --> API5[GET /api/departments]
    API5 --> P2[部门管理Tab]
    M2 --> API6[POST/PUT/DELETE /api/departments]
    API6 --> P2
    end
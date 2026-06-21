# 技术方案

## 开发元信息

- 开发模式: 全栈应用
- 涉及层级: [数据库, 服务端, 前端]

## 页面路由与导航

### 页面路由

| 路由路径 | 页面名称 |
|---------|---------|
| `/` | 首页/考核概览页 |
| `/template-management` | 考核模板管理页 |
| `/employee-binding` | 员工模板绑定页 |
| `/publish-management` | 考核发布管理页 |
| `/assessment/:id` | 考核详情/操作页 |
| `/statistics` | 考核统计查询页 |

### 导航设计

- 导航机制：页面路由
- 导航项：
  - 首页
  - 考核模板管理
  - 员工模板绑定
  - 考核发布管理
  - 考核统计查询

## 业务组件

| 组件 | 来源 | 关联页面 | 对应功能点 |
|------|------|---------|-----------|
| Table | @lark-apaas/client-toolkit/antd-table | 考核模板管理页、员工模板绑定页、考核发布管理页、考核统计查询页 | 模板列表、绑定列表、考核实例列表、考核记录列表 |
| UserSelect | @client/src/components/business-ui/user-select | 员工模板绑定页、考核发布管理页 | 选择员工、选择上级 |
| UserDisplay | @client/src/components/business-ui/user-display | 所有页面 | 展示员工姓名头像、上级姓名头像 |

## 数据模型

### 数据库设计

#### 员工表（employee）
用途：存储员工基本信息、组织关系与在职状态。
核心字段：
- name: varchar (员工姓名)
- position: varchar (岗位名称)
- department: varchar (所属部门)
- supervisor_id: user_profile (直接上级ID，HRD为空)
- status: varchar ['active', 'inactive'] (在职状态，inactive不参与考核)
关联关系：自引用，supervisor_id关联employee.id，一对多。

#### 考核模板表（assessment_template）
用途：存储各岗位考核模板的基础配置。
核心字段：
- name: varchar (模板名称)
- position: varchar (适用岗位)
- type: varchar ['monthly', 'probation'] (考核类型：月度/转正)
- is_active: boolean (是否启用，停用后不可新绑定)
关联关系：一对多关联考核维度、员工绑定表。

#### 考核维度表（assessment_dimension）
用途：存储考核模板下的维度分组信息。
核心字段：
- template_id: varchar (关联assessment_template.id)
- name: varchar (维度名称，如「显性工作指标」)
- weight: numeric (维度权重0-1，同模板下总和为1)
- sort_order: int (排序)
关联关系：多对一关联考核模板，一对多关联考核指标。

#### 考核指标表（assessment_indicator）
用途：存储各维度下的考核指标定义。
核心字段：
- dimension_id: varchar (关联assessment_dimension.id)
- content: varchar (指标名称)
- description: text (指标描述与口径)
- algorithm: text (计分规则)
- data_source: varchar (数据来源)
- max_score: numeric (指标满分，同模板下总和为100)
- sort_order: int (排序)
关联关系：多对一关联考核维度。

#### 员工绑定表（employee_binding）
用途：存储员工与考核模板的绑定关系。
核心字段：
- employee_id: user_profile (关联employee.id)
- template_id: varchar (关联assessment_template.id)
- effective_from: varchar (生效月份，格式yyyy-mm)
- status: varchar ['active', 'inactive'] (绑定状态)
- created_by: user_profile (操作人HRD ID)
关联关系：多对一关联员工、考核模板。

#### 考核实例表（assessment_instance）
用途：存储每个员工每个月的考核实例信息。
核心字段：
- period: varchar (考核月份，格式yyyy-mm)
- employee_id: user_profile (被考核人ID)
- supervisor_id: user_profile (考核时上级ID快照)
- position: varchar (考核时岗位快照)
- template_id: varchar (关联考核模板ID)
- total_score: numeric (最终得分，上级提交后自动计算)
- grade: varchar ['S','A','B','C','D'] (考核等级)
- status: varchar ['draft','self_review','supervisor_review','pending_sign','completed'] (考核状态)
- self_sign_name: varchar (员工签名姓名)
- self_sign_at: timestamp (员工签名时间)
- supervisor_sign_name: varchar (上级签名姓名)
- supervisor_sign_at: timestamp (上级签名时间)
- published_by: user_profile (发布人HRD ID)
- published_at: timestamp (发布时间)
- completed_at: timestamp (完成时间)
关联关系：多对一关联员工、考核模板，一对多关联指标快照、评分记录。

#### 考核指标快照表（assessment_indicator_snapshot）
用途：存储考核发布时的指标快照，与模板解耦。
核心字段：
- instance_id: varchar (关联assessment_instance.id)
- dimension_name: varchar (维度名称快照)
- dimension_weight: numeric (维度权重快照)
- content: varchar (指标名称)
- description: text (指标描述)
- algorithm: text (计分规则)
- data_source: varchar (数据来源)
- max_score: numeric (满分值)
- is_adjusted: boolean (是否当月调整过)
- adjusted_by: user_profile (调整人ID)
- adjusted_at: timestamp (调整时间)
- sort_order: int (排序)
关联关系：多对一关联考核实例，一对多关联评分记录。

#### 评分记录表（rating_record）
用途：存储自评和上级评分的详细记录。
核心字段：
- instance_id: varchar (关联assessment_instance.id)
- indicator_snapshot_id: varchar (关联assessment_indicator_snapshot.id)
- rating_type: varchar ['self', 'supervisor'] (评分类型：自评/上级评)
- score: numeric (得分，不超过指标满分)
- comment: text (完成情况说明/评语)
- rated_by: user_profile (评分人ID)
- submitted_at: timestamp (提交时间)
- is_draft: boolean (是否为草稿)
关联关系：多对一关联考核实例、指标快照、员工。

#### 操作日志表（audit_log）
用途：存储所有关键操作的审计记录。
核心字段：
- operator_id: user_profile (操作人ID)
- action: varchar (操作类型枚举)
- target_type: varchar (操作对象类型)
- target_id: varchar (操作对象ID)
- changes: json (变更前后对比)
- reason: varchar (操作原因，解锁等场景必填)
关联关系：无。

## 业务模型

### API 设计

#### 首页/考核概览页 相关

**页面路径**: /

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取待办任务列表 | API | GET /api/dashboard/todos |
| 获取统计概览数据 | API | GET /api/dashboard/overview |
| 获取当前用户信息 | 平台能力 | 内置用户系统 |

**所需 API**:
```typescript
// 获取当前用户待办考核任务 [领域模型: AssessmentInstance] [对应页面功能: 待办任务区]
GET /api/dashboard/todos
Response: {
  items: Array<{
    id: string;
    period: string;
    type: 'self_review' | 'supervisor_review' | 'sign';
    title: string;
    deadline?: string;
  }>;
}

// 获取当前用户对应角色的统计概览 [领域模型: AssessmentInstance] [对应页面功能: 数据概览区]
GET /api/dashboard/overview
Response: {
  stats: {
    pendingCount: number;
    completedCount: number;
    avgScore?: number;
    gradeDistribution?: Record<string, number>;
    trend?: Array<{ month: string; score: number }>;
  };
  shortcuts: Array<{
    title: string;
    path: string;
  }>;
}
```

#### 考核模板管理页 相关

**页面路径**: /template-management

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取模板列表 | API | GET /api/assessment-templates |
| 创建/编辑模板 | API | POST /api/assessment-templates、PUT /api/assessment-templates/:id |
| 停用模板 | API | PATCH /api/assessment-templates/:id/deactivate |
| 预览模板详情 | API | GET /api/assessment-templates/:id |

**所需 API**:
```typescript
// 分页获取考核模板列表 [领域模型: AssessmentTemplate] [对应页面功能: 模板列表]
GET /api/assessment-templates?page=1&pageSize=20&keyword=&position=&status=
Response: {
  items: Array<{
    id: string;
    name: string;
    position: string;
    type: string;
    isActive: boolean;
    createdAt: string;
  }>;
  total: number;
}

// 获取模板详情（含维度和指标） [领域模型: AssessmentTemplate] [对应页面功能: 模板预览]
GET /api/assessment-templates/:id
Response: {
  id: string;
  name: string;
  position: string;
  type: string;
  isActive: boolean;
  dimensions: Array<{
    id: string;
    name: string;
    weight: number;
    indicators: Array<{
      id: string;
      content: string;
      description: string;
      algorithm: string;
      dataSource: string;
      maxScore: number;
    }>;
  }>;
}

// 创建考核模板 [领域模型: AssessmentTemplate] [对应页面功能: 新建模板]
POST /api/assessment-templates
Request Body: {
  name: string;
  position: string;
  type: 'monthly' | 'probation';
  dimensions: Array<{
    name: string;
    weight: number;
    indicators: Array<{
      content: string;
      description: string;
      algorithm: string;
      dataSource: string;
      maxScore: number;
    }>;
  }>;
}
Response: {
  id: string;
}

// 更新考核模板 [领域模型: AssessmentTemplate] [对应页面功能: 编辑模板]
PUT /api/assessment-templates/:id
Request Body: 同创建接口
Response: {
  success: boolean;
}

// 停用考核模板 [领域模型: AssessmentTemplate] [对应页面功能: 停用模板]
PATCH /api/assessment-templates/:id/deactivate
Response: {
  success: boolean;
}
```

#### 员工模板绑定页 相关

**页面路径**: /employee-binding

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取绑定列表 | API | GET /api/employee-bindings |
| 绑定员工模板 | API | POST /api/employee-bindings |
| 解绑模板 | API | PATCH /api/employee-bindings/:id/deactivate |
| 获取绑定历史 | API | GET /api/employee-bindings/:id/history |
| 选择用户 | 平台能力 | UserSelect组件 |

**所需 API**:
```typescript
// 分页获取员工绑定列表 [领域模型: EmployeeBinding] [对应页面功能: 绑定列表]
GET /api/employee-bindings?page=1&pageSize=20&employeeName=&templateId=&status=
Response: {
  items: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    position: string;
    templateId: string;
    templateName: string;
    effectiveFrom: string;
    status: string;
    createdAt: string;
  }>;
  total: number;
}

// 绑定员工与考核模板 [领域模型: EmployeeBinding] [对应页面功能: 绑定操作]
POST /api/employee-bindings
Request Body: {
  employeeIds: string[];
  templateId: string;
  effectiveFrom: string;
}
Response: {
  success: boolean;
}

// 解绑员工模板 [领域模型: EmployeeBinding] [对应页面功能: 解绑操作]
PATCH /api/employee-bindings/:id/deactivate
Response: {
  success: boolean;
}

// 获取员工绑定历史 [领域模型: EmployeeBinding] [对应页面功能: 历史记录]
GET /api/employee-bindings/:employeeId/history
Response: {
  items: Array<{
    templateName: string;
    effectiveFrom: string;
    status: string;
    operatedBy: string;
    operatedAt: string;
  }>;
}
```

#### 考核发布管理页 相关

**页面路径**: /publish-management

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取待发布员工列表 | API | GET /api/publish/employees?period= |
| 批量发布考核 | API | POST /api/publish |
| 调整实例指标 | API | PATCH /api/assessment-instances/:id/adjust |
| 解锁考核实例 | API | PATCH /api/assessment-instances/:id/unlock |
| 获取考核实例列表 | API | GET /api/assessment-instances?period= |

**所需 API**:
```typescript
// 获取指定月份待考核员工列表 [领域模型: EmployeeBinding] [对应页面功能: 考核周期选择]
GET /api/publish/employees?period=2026-05
Response: {
  items: Array<{
    employeeId: string;
    employeeName: string;
    position: string;
    templateId: string;
    templateName: string;
  }>;
}

// 批量发布月度考核 [领域模型: AssessmentInstance] [对应页面功能: 批量发布]
POST /api/publish
Request Body: {
  period: string;
  employeeIds?: string[]; // 不传则发布所有符合条件的员工
  adjustments?: Array<{
    employeeId: string;
    indicators: Array<{
      content: string;
      description: string;
      algorithm: string;
      dataSource: string;
      maxScore: number;
    }>;
  }>;
}
Response: {
  success: boolean;
  publishedCount: number;
}

// 分页获取指定月份考核实例列表 [领域模型: AssessmentInstance] [对应页面功能: 考核实例列表]
GET /api/assessment-instances?period=2026-05&page=1&pageSize=20&status=
Response: {
  items: Array<{
    id: string;
    employeeName: string;
    position: string;
    supervisorName: string;
    status: string;
    totalScore?: number;
    grade?: string;
    publishedAt: string;
  }>;
  total: number;
}

// 调整考核实例指标 [领域模型: AssessmentIndicatorSnapshot] [对应页面功能: 调整指标]
PATCH /api/assessment-instances/:id/adjust
Request Body: {
  indicators: Array<{
    id?: string;
    dimensionName: string;
    dimensionWeight: number;
    content: string;
    description: string;
    algorithm: string;
    dataSource: string;
    maxScore: number;
  }>;
  reason: string;
}
Response: {
  success: boolean;
}

// 解锁考核实例回退状态 [领域模型: AssessmentInstance] [对应页面功能: 解锁操作]
PATCH /api/assessment-instances/:id/unlock
Request Body: {
  reason: string;
}
Response: {
  success: boolean;
}
```

#### 考核详情/操作页 相关

**页面路径**: /assessment/:id

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取考核详情 [领域模型: AssessmentInstance] | API | GET /api/assessment-instances/:id |
| 暂存/提交自评 [领域模型: RatingRecord] | API | POST /api/assessment-instances/:id/self-rating |
| 暂存/提交上级评分 [领域模型: RatingRecord] | API | POST /api/assessment-instances/:id/supervisor-rating |
| 签名确认 [领域模型: AssessmentInstance] | API | POST /api/assessment-instances/:id/sign |

**所需 API**:
```typescript
// 获取考核实例详情（含指标和评分） [领域模型: AssessmentInstance] [对应页面功能: 考核基础信息+指标填写区]
GET /api/assessment-instances/:id
Response: {
  id: string;
  period: string;
  employeeId: string;
  employeeName: string;
  position: string;
  supervisorId: string;
  supervisorName: string;
  status: string;
  totalScore?: number;
  grade?: string;
  selfSignName?: string;
  selfSignAt?: string;
  supervisorSignName?: string;
  supervisorSignAt?: string;
  indicators: Array<{
    id: string;
    dimensionName: string;
    dimensionWeight: number;
    content: string;
    description: string;
    algorithm: string;
    dataSource: string;
    maxScore: number;
    selfScore?: number;
    selfComment?: string;
    supervisorScore?: number;
    supervisorComment?: string;
  }>;
}

// 暂存或提交自评 [领域模型: RatingRecord] [对应页面功能: 填写自评]
POST /api/assessment-instances/:id/self-rating
Request Body: {
  isDraft: boolean;
  ratings: Array<{
    indicatorSnapshotId: string;
    score: number;
    comment?: string;
  }>;
}
Response: {
  success: boolean;
}

// 暂存或提交上级评分 [领域模型: RatingRecord] [对应页面功能: 上级评分]
POST /api/assessment-instances/:id/supervisor-rating
Request Body: {
  isDraft: boolean;
  ratings: Array<{
    indicatorSnapshotId: string;
    score: number;
    comment?: string;
  }>;
}
Response: {
  success: boolean;
  totalScore: number;
  grade: string;
}

// 签名确认考核结果 [领域模型: AssessmentInstance] [对应页面功能: 签名操作]
POST /api/assessment-instances/:id/sign
Request Body: {
  signType: 'self' | 'supervisor';
  signName: string;
}
Response: {
  success: boolean;
  status: string;
}
```

#### 考核统计查询页 相关

**页面路径**: /statistics

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 筛选查询考核记录 | API | GET /api/statistics/records |
| 获取统计图表数据 | API | GET /api/statistics/charts |
| 导出考核数据 | API | GET /api/statistics/export |

**所需 API**:
```typescript
// 分页查询考核记录 [领域模型: AssessmentInstance] [对应页面功能: 考核列表]
GET /api/statistics/records?page=1&pageSize=20&period=&department=&position=&grade=&employeeName=
Response: {
  items: Array<{
    id: string;
    period: string;
    employeeName: string;
    department: string;
    position: string;
    supervisorName: string;
    totalScore: number;
    grade: string;
    status: string;
    completedAt?: string;
  }>;
  total: number;
}

// 获取统计图表数据 [领域模型: AssessmentInstance] [对应页面功能: 统计分析区]
GET /api/statistics/charts?startPeriod=&endPeriod=&department=
Response: {
  gradeDistribution: Array<{ grade: string; count: number }>;
  departmentAvg: Array<{ department: string; avgScore: number }>;
  trend: Array<{ month: string; avgScore: number }>;
}

// 导出考核数据为Excel [领域模型: AssessmentInstance] [对应页面功能: 导出数据]
GET /api/statistics/export?period=&department=&position=&grade=&employeeName=
Response: Blob (Excel文件流)
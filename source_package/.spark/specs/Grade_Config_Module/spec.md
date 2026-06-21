# 需求分析
## 需求描述
- 绩效等级配置管理：支持可视化配置绩效总分区间对应的等级，支持新增、编辑、删除、排序等级规则，配置实时生效
  - 验证条件：管理员/HRD可在配置页维护等级名称、分数区间、排序规则，系统自动校验分数区间无重叠且完整覆盖0-100分范围
- 绩效等级自动匹配：员工上级评分提交完成后，自动根据总分匹配配置的等级规则，存储并返回对应等级
  - 验证条件：新提交的评分结果返回的等级与配置的分数区间完全匹配，历史已生成的考核等级不受配置变更影响
- 全链路等级展示适配：现有考核列表、详情、统计等所有涉及等级展示的页面无需修改即可正常展示新规则生成的等级
  - 验证条件：考核发布管理、我的考核、团队绩效、统计查询等原有页面的等级展示与计算结果一致

## 页面列表
### 绩效等级配置页
1. 等级列表展示（等级名称、分数区间、排序、启用状态、操作按钮）
2. 新增/编辑等级弹窗（名称、最低分、最高分、排序输入）
3. 等级删除确认功能
4. 配置实时校验（分数区间无重叠、覆盖0-100全范围提示）

# 技术方案
## 技术架构
- 后端：NestJS 10.x + Drizzle ORM + PostgreSQL
- 前端：React 19 + Tailwind CSS + shadcn/ui
- 权限控制：沿用现有内置角色权限体系，仅admin/hrd可访问配置页
- 兼容现有数据结构：原有assessment_instance表的grade字段复用，无需修改

## 页面路由与导航
### 页面路由
- `/grade-config` → 绩效等级配置页（权限：ADMIN_HRD_ROLES）

### 导航设计
- 导航机制：页面路由
- 导航项：
  - 绩效等级配置（路径：`/grade-config`，图标：Award，角色：['admin', 'hrd']）

## 数据模型
### 数据库设计
#### 绩效等级配置表（performance_grade）
用途：存储绩效等级与分数区间的映射配置，支持动态调整
核心字段：
- name: string (等级名称，如S/A/B/C/D)
- minScore: integer (最低分，包含该分数)
- maxScore: integer (最高分，不包含该分数)
- sortOrder: integer (排序值，越小优先级越高)
- isActive: boolean (是否启用，仅启用的规则参与匹配)
关联关系：无独立关联，考核评分时查询该表匹配等级

## 业务模型
### 领域模型
- PerformanceGradeService：绩效等级配置CRUD、等级匹配计算、配置校验逻辑
- 改造AssessmentOperationService：原有评分提交逻辑中，替换硬编码等级判断为调用PerformanceGradeService的等级匹配方法

### API 设计
#### 绩效等级配置页 相关
**页面路径**: /grade-config
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 展示等级配置列表 | API | GET /api/performance-grades |
| 新增等级配置 | API | POST /api/performance-grades |
| 更新等级配置 | API | PUT /api/performance-grades/:id |
| 删除等级配置 | API | DELETE /api/performance-grades/:id |

**需实现的 API**：
- 绩效等级配置列表查询
- 新增绩效等级配置
- 更新绩效等级配置
- 删除绩效等级配置

**所需 API**:
```typescript
// 获取绩效等级配置列表 [领域模型: PerformanceGradeService] [对应页面功能: 展示等级配置列表]
GET /api/performance-grades
Response: {
  items: Array<{
    id: string;
    name: string;
    minScore: number;
    maxScore: number;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
  }>;
}

// 新增绩效等级配置 [领域模型: PerformanceGradeService] [对应页面功能: 新增等级配置]
POST /api/performance-grades
Request Body: {
  name: string;
  minScore: number;
  maxScore: number;
  sortOrder: number;
  isActive: boolean;
}
Response: {
  id: string;
  success: boolean;
}

// 更新绩效等级配置 [领域模型: PerformanceGradeService] [对应页面功能: 更新等级配置]
PUT /api/performance-grades/:id
Request Body: {
  name: string;
  minScore: number;
  maxScore: number;
  sortOrder: number;
  isActive: boolean;
}
Response: {
  success: boolean;
}

// 删除绩效等级配置 [领域模型: PerformanceGradeService] [对应页面功能: 删除等级配置]
DELETE /api/performance-grades/:id
Response: {
  success: boolean;
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "绩效等级配置页"
    DB1[performance_grade 表] --> M1[PerformanceGradeService]
    M1 --> API1[GET /api/performance-grades]
    API1 --> P1[绩效等级配置页]
    P1 --> API2[POST/PUT/DELETE /api/performance-grades]
    API2 --> M1
    M1 --> DB1
    end
    
    subgraph "考核评分流程"
    DB1 --> M2[AssessmentOperationService]
    M2 --> API3[POST /api/assessment-operation/:id/supervisor-rate]
    API3 --> P2[考核详情页]
    M2 --> DB2[assessment_instance 表]
    end
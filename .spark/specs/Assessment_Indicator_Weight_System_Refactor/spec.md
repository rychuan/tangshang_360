# 需求分析
## 需求描述
- 考核维度权重配置：支持配置多个考核维度，所有维度权重总和必须为100%
  - 验证条件：创建/更新模板时自动校验维度权重总和为100，不符合则抛出错误
- 考核指标权重配置：每个维度下可配置多个指标，同一维度下所有指标权重总和必须等于该维度的权重
  - 验证条件：创建/更新模板时自动校验每个维度下指标权重总和等于维度权重，所有指标总权重和为100%
- 权重与分数映射：指标权重直接对应该指标的满分，如指标权重30%则该指标满分为30分
  - 验证条件：指标展示时权重作为满分显示，评分时不允许超过权重值
- 总分计算逻辑简化：考核总分直接为所有指标得分之和，无需额外加权计算
  - 验证条件：上级评分提交后自动计算总分为所有指标得分之和，满分100分
- 前端模板编辑权重校验：模板创建/编辑页实时校验权重配置合法性，给出错误提示
  - 验证条件：用户输入权重时实时显示当前总和，提交前自动校验不通过则禁止提交

## 页面列表
### 考核模板管理页
1. 维度权重输入框，实时显示当前维度总权重
2. 每个维度下指标权重输入框，实时显示当前维度下指标总权重
3. 权重校验错误提示，明确告知不符合规则的原因
4. 提交按钮根据权重校验结果动态禁用/启用

# 技术方案
## 技术架构
- 前端：React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- 后端：NestJS 10 + TypeScript + Drizzle ORM
- 数据库：PostgreSQL

## 页面路由与导航
### 页面路由
- `/template-management` → 考核模板管理页（复用现有路由，无新增）
### 导航设计
- 导航机制：页面路由（复用现有导航，无变更）
- 导航项：保持现有配置不变

## 数据模型
### 数据库设计
#### 考核指标表（assessment_indicator）
用途：存储考核模板下的指标定义与权重配置
核心字段：
- id: uuid (主键)
- dimensionId: uuid (关联 -> assessment_dimension.id)
- content: string (指标内容)
- weight: numeric (指标权重，对应满分值)
- description: text (指标描述)
- algorithm: text (考核算法)
- dataSource: string (数据来源)
- sortOrder: integer (排序)
关联关系：与考核维度表是多对一关系
变更说明：将原有`max_score`字段重命名为`weight`，语义与用途保持一致

#### 考核指标快照表（assessment_indicator_snapshot）
用途：存储考核实例的指标快照与权重配置
核心字段：
- id: uuid (主键)
- instanceId: uuid (关联 -> assessment_instance.id)
- dimensionName: string (维度名称)
- dimensionWeight: numeric (维度权重)
- content: string (指标内容)
- weight: numeric (指标权重，对应满分值)
- description: text (指标描述)
- algorithm: text (考核算法)
- dataSource: string (数据来源)
- isAdjusted: boolean (是否调整过)
关联关系：与考核实例表是多对一关系
变更说明：将原有`max_score`字段重命名为`weight`，语义与用途保持一致

## 业务模型
### 领域模型
- AssessmentTemplateModel：新增指标权重校验逻辑，支持维度权重与指标权重的双重校验
- AssessmentPublishModel：考核发布生成快照时，同步保存指标权重到快照表
- AssessmentOperationModel：评分时使用权重作为满分校验，总分计算逻辑简化

### API 设计
#### 考核模板管理页 相关
**页面路径**: /template-management
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 创建考核模板 | API | POST /api/assessment-templates |
| 更新考核模板 | API | PUT /api/assessment-templates/:id |
| 获取模板详情 | API | GET /api/assessment-templates/:id |
| 权重校验 | 后端逻辑 | 接口层自动校验权重配置合法性 |

**需实现的 API 变更**：
1. 共享类型定义更新：将所有指标相关类型中的`maxScore`字段替换为`weight`
2. 创建/更新模板接口：出入参同步更新为weight字段，新增权重校验逻辑
3. 模板详情接口：返回指标weight字段替代原有maxScore
4. 考核实例详情接口：返回指标weight字段替代原有maxScore
5. 指标调整接口：出入参同步更新为weight字段

**所需 API 类型变更示例**：
```typescript
// 原AssessmentIndicatorDef
export interface AssessmentIndicatorDef {
  id: string;
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number; // 替换原有maxScore
}

// 创建模板请求参数
export interface CreateTemplateRequest {
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
      weight: number; // 替换原有maxScore
    }>;
  }>;
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "考核模板管理页"
    U1[用户输入维度/指标权重] --> FE1[前端实时校验权重]
    FE1 --> API1[POST/PUT /api/assessment-templates]
    API1 --> M1[AssessmentTemplateModel 校验权重]
    M1 --> DB1[assessment_dimension 表存维度权重]
    M1 --> DB2[assessment_indicator 表存指标权重]
    end
    
    subgraph "考核发布流程"
    API2[POST /api/assessment-publish] --> M2[AssessmentPublishModel 生成快照]
    DB2 --> M2
    M2 --> DB3[assessment_indicator_snapshot 表存指标权重快照]
    end
    
    subgraph "考核评分流程"
    DB3 --> API3[GET /api/assessment-operation/:id]
    API3 --> FE2[评分页展示指标权重作为满分]
    FE2 --> API4[POST /api/assessment-operation/:id/supervisor-rating]
    API4 --> M3[AssessmentOperationModel 计算总分=sum(指标得分)]
    M3 --> DB4[assessment_instance 表存总分]
    end
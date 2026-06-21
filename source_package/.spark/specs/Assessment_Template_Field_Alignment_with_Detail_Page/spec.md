# 需求分析
## 需求描述
1. 考核模板字段与员工考核详情页完全对齐，统一字段命名和映射关系
   - 验证条件：模板维度/指标字段与详情页展示字段100%对应，无遗漏或不匹配
2. 模板创建/编辑表单的字段标签与考核详情页列名保持一致
   - 验证条件：表单字段标签与详情页列名完全相同（指标、说明、指标算法/描述、数据来源、满分）
3. 模板预览页面的展示结构与考核详情页保持一致，采用表格形式展示全部字段
   - 验证条件：预览页字段展示顺序、名称与详情页完全相同
4. 模板字段在全链路（模板→发布考核→考核详情）中完整传递无丢失
   - 验证条件：模板中填写的所有字段内容在生成的考核详情页中完整展示

## 页面列表
### 考核模板管理页
1. 模板列表展示模板基础信息（名称、岗位、类型、状态、操作）
2. 新建/编辑模板表单：字段标签与详情页对齐，支持输入维度、指标、说明、指标算法/描述、数据来源、满分、权重
3. 模板预览弹窗：采用与考核详情页一致的表格结构，展示完整的维度和指标字段
4. 模板停用/启用操作

# 技术方案
## 技术架构
- 前端：React 19 + TypeScript + Tailwind CSS + shadcn/ui
- 后端：NestJS 10 + Drizzle ORM + PostgreSQL
- 现有能力复用：复用现有AssessmentTemplate模块、模板CRUD接口、考核发布流程

## 页面路由与导航
### 页面路由
- 现有路由保持不变：`/template-management` → 考核模板管理页
### 导航设计
- 导航机制：页面路由
- 导航项：现有「考核模板管理」保持不变

## 数据模型
现有数据库表已完整支持所有字段，无需修改结构：
### 数据库设计
#### 考核模板表（assessment_template）
用途：存储考核模板基础信息
核心字段：id, name, position, type, isActive
关联关系：与assessment_dimension表一对多

#### 考核维度表（assessment_dimension）
用途：存储考核模板的维度信息
核心字段：template_id, name, weight
关联关系：与assessment_template多对一，与assessment_indicator一对多

#### 考核指标表（assessment_indicator）
用途：存储考核维度下的指标信息，与考核详情页字段完全对应
核心字段：
- dimension_id: string 关联维度ID
- content: string 指标（对应详情页「指标」列）
- description: text 说明（对应详情页「说明」列）
- algorithm: text 指标算法/描述（对应详情页「指标算法/描述」列）
- data_source: string 数据来源（对应详情页「数据来源」列）
- max_score: numeric 满分（对应详情页「满分」列）
关联关系：与assessment_dimension多对一

## 业务模型
### 领域模型
- AssessmentTemplateModule：负责考核模板的CRUD、维度和指标的存储，现有模块无需新增功能，仅需确保字段映射正确

### API 设计
现有API已完整支持所有字段操作，无需新增接口：
#### 考核模板管理页 相关
**页面路径**: /template-management
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 查询模板列表 | API | GET /api/assessment-templates |
| 获取模板详情 | API | GET /api/assessment-templates/:id |
| 创建模板 | API | POST /api/assessment-templates |
| 更新模板 | API | PUT /api/assessment-templates/:id |
| 停用模板 | API | PATCH /api/assessment-templates/:id/deactivate |

**所需 API**：
```typescript
// 获取模板列表 [领域模型: AssessmentTemplate] [对应页面功能: 模板列表展示]
GET /api/assessment-templates?page=1&pageSize=20&keyword=xxx&position=xxx&status=xxx
Response: {
  items: Array<{
    id: string;
    name: string;
    position: string;
    type: 'monthly' | 'probation';
    isActive: boolean;
    createdAt: string;
    dimensionCount: number;
    indicatorCount: number;
  }>;
  total: number;
}

// 获取模板详情 [领域模型: AssessmentTemplate] [对应页面功能: 编辑/预览模板]
GET /api/assessment-templates/:id
Response: {
  id: string;
  name: string;
  position: string;
  type: 'monthly' | 'probation';
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

// 创建模板 [领域模型: AssessmentTemplate] [对应页面功能: 新建模板]
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
Response: { success: boolean; id: string; }
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "模板管理流程"
    DB1[assessment_template 表] --> M1[AssessmentTemplate 模型]
    DB2[assessment_dimension 表] --> M1
    DB3[assessment_indicator 表] --> M1
    M1 --> API1[GET /api/assessment-templates]
    API1 --> P1[考核模板管理页]
    
    P1 --> API2[POST/PUT /api/assessment-templates]
    API2 --> M1
    
    M1 --> PUB[考核发布流程]
    PUB --> SNAP[assessment_indicator_snapshot 表]
    SNAP --> API3[GET /api/assessments/:id]
    API3 --> P2[员工考核详情页]
    end
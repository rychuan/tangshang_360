# 需求分析
## 需求描述
1. 调整考核指标弹窗支持维度编辑：在现有调整弹窗的编辑模式下，新增维度名称和维度权重的输入项，允许用户修改每个指标所属的维度信息
  - 验证条件：编辑模式下每个指标卡片显示维度名称、维度权重输入框，修改后提交成功保存到数据库，预览模式可正常展示维度信息
2. 明确调整数据存储规则：调整后的考核指标及维度信息存储在考核指标快照表，标记为已调整状态，保留操作痕迹
  - 验证条件：调整后查询assessment_indicator_snapshot表，对应instanceId的记录包含修改后的维度信息，isAdjusted=true，且有调整人、调整时间字段
3. 明确调整生效范围：考核指标调整仅对当前选中的考核实例生效，不影响后续月份的考核发布
  - 验证条件：当月调整的指标，下月发布同员工考核时，仍使用员工绑定的考核模板原始指标数据，不会复用调整后的内容

## 页面列表
### 考核发布管理页
1. 已发布考核列表支持"调整"操作
2. 调整考核指标弹窗编辑模式下，增加维度名称、维度权重输入字段
3. 调整成功后弹窗自动关闭，列表刷新

# 技术方案
## 技术架构
- 前端：React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- 后端：NestJS 10 + Drizzle ORM
- 数据库：PostgreSQL
- 复用现有接口，无需新增服务端能力

## 页面路由与导航
### 页面路由
- 现有路由保持不变：/publish-management → 考核发布管理页
### 导航设计
- 现有导航保持不变，无需调整

## 数据模型
### 数据库设计
现有表结构无需修改，调整数据存储在assessment_indicator_snapshot表：
#### 考核指标快照表（assessment_indicator_snapshot）
用途：存储每个考核实例的指标快照（含调整后的指标）
核心字段：
- instanceId: uuid (关联考核实例ID)
- dimensionName: varchar (维度名称，非空)
- dimensionWeight: numeric (维度权重，非空)
- content: varchar (指标内容)
- weight: numeric (指标权重)
- isAdjusted: boolean (是否为调整后的指标，默认false)
- adjustedBy: userProfile (调整人ID)
- adjustedAt: timestamptz (调整时间)
关联关系：与assessment_instance表是多对一关系

## 业务模型
### 领域模型
- AssessmentPublishService：复用现有调整逻辑，无需新增领域模型

### API 设计
#### 考核发布管理页 相关
**页面路径**: /publish-management
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取实例指标 | API | GET /api/assessment-publish/:instanceId/indicators |
| 提交调整指标 | API | POST /api/assessment-publish/:instanceId/adjust |

**需实现的API（复用现有接口，仅前端新增维度字段传参）**：
```typescript
// 获取考核实例指标 [领域模型: AssessmentPublishService] [对应页面功能: 加载待调整的指标]
GET /api/assessment-publish/:instanceId/indicators
Response: {
  indicators: Array<{
    content: string;
    description: string;
    algorithm: string;
    dataSource: string;
    weight: number;
    dimensionName?: string;
    dimensionWeight?: number;
  }>;
}

// 提交调整指标 [领域模型: AssessmentPublishService] [对应页面功能: 保存调整后的指标（含维度信息）]
POST /api/assessment-publish/:instanceId/adjust
Request Body: {
  indicators: Array<{
    content: string;
    description: string;
    algorithm: string;
    dataSource: string;
    weight: number;
    dimensionName?: string; // 前端新增传参
    dimensionWeight?: number; // 前端新增传参
  }>;
}
Response: {
  success: boolean;
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "调整考核指标流程"
    A[用户在调整弹窗修改指标+维度信息] --> B[前端调用调整接口提交数据]
    B --> C[AssessmentPublishService删除该实例旧的快照记录]
    C --> D[插入新的快照记录，标记isAdjusted=true，记录调整信息]
    D --> E[返回调整成功结果]
    E --> F[前端刷新列表，关闭弹窗]
    end
    
    subgraph "下月发布流程（调整不影响）"
    G[下月发布考核] --> H[系统读取员工绑定的模板原始指标]
    H --> I[生成新的考核实例和快照，使用模板原始数据]
    end
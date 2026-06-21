# 需求分析
## 需求描述
- 考核周期概览统计：展示当前周期核心指标（待发布人数、已发布人数、自评完成率、待处理考核数）
  - 概览卡片数据与实际业务数据实时同步，统计维度准确
- 待发布列表优化：增加员工历史考核状态、所属部门展示，支持按部门/考核模板筛选
  - 待发布列表支持多维度筛选，员工卡片显示上月考核完成状态、绑定模板信息
- 已发布列表优化：增加考核进度列（自评完成占比/上级评分完成占比）、发布时间、操作人信息，支持按部门/考核等级/完成状态多维度筛选
  - 列表展示完整进度信息，筛选条件可组合使用，数据分页正常
- 考核调整功能优化：调整弹窗默认加载当前考核已有的指标数据，支持一键复制模板指标，调整前可预览原有指标
  - 调整时无需重新录入全部指标，可直接基于现有指标修改
- 批量操作能力：支持批量解锁考核、批量重新发送考核通知、批量导出考核列表
  - 批量操作执行后有明确成功/失败提示，数据实时刷新
- 操作状态提示：发布/调整/解锁操作增加进度提示，成功后自动刷新对应列表数据
  - 操作过程有loading状态，操作结果有明确反馈，无数据断层

## 页面列表
### 考核发布管理页
1. 顶部周期选择栏 + 核心指标概览卡片组
2. 待发布员工列表（支持筛选、批量选择、快速发布）
3. 已发布考核列表（支持多维度筛选、批量操作）
4. 考核指标调整弹窗（支持加载现有指标、编辑、预览）
5. 解锁考核弹窗（支持批量解锁、原因填写）

# 技术方案
## 技术架构
- 前端：React 19 + Tailwind CSS + shadcn/ui + antd-table
- 后端：NestJS + Drizzle ORM + PostgreSQL
- 复用现有 `AssessmentPublish` 模块能力，仅扩展接口和优化前端交互，不改变核心业务流程
- 数据统计基于现有表结构聚合查询，无需新增数据库表

## 页面路由与导航
### 页面路由
- `/publish-management` → 考核发布管理页（复用现有路由，无需新增）
### 导航设计
- 导航机制：页面路由（沿用现有导航配置，无需修改）
- 导航项：保留原有「考核发布管理」导航项

## 业务模型
### 领域模型
- **AssessmentPublishService**：
  - 新增 `getPeriodStatistics` 方法：统计指定周期的概览指标
  - 新增 `getInstanceIndicators` 方法：查询指定考核实例的现有指标
  - 新增 `batchUnlock` 方法：批量解锁考核实例
  - 新增 `batchResendNotification` 方法：批量发送考核通知
  - 扩展 `listInstances` 方法：返回考核进度统计数据

### API 设计
#### 考核发布管理页 相关
**页面路径**: /publish-management
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取周期概览统计 | API | GET /api/publish/statistics |
| 获取考核实例现有指标 | API | GET /api/assessment-instances/:id/indicators |
| 批量解锁考核 | API | PATCH /api/assessment-instances/batch-unlock |
| 批量重发通知 | API | POST /api/assessment-instances/batch-notify |
| 列表查询（扩展） | API | GET /api/assessment-instances（新增返回进度字段） |

**需实现的 API**：
```typescript
// 获取周期概览统计 [领域模型: AssessmentPublishService] [对应页面功能: 顶部概览卡片]
GET /api/publish/statistics?period=xxx
Response: {
  toPublishCount: number; // 待发布人数
  publishedCount: number; // 已发布人数
  selfReviewCompletedRate: number; // 自评完成率（百分比）
  pendingCount: number; // 待处理考核数
}

// 获取考核实例现有指标 [领域模型: AssessmentPublishService] [对应页面功能: 调整指标弹窗加载原有数据]
GET /api/assessment-instances/:id/indicators
Response: {
  indicators: Array<{
    content: string;
    description: string;
    algorithm: string;
    dataSource: string;
    maxScore: number;
    dimensionName?: string;
    dimensionWeight?: number;
  }>
}

// 批量解锁考核 [领域模型: AssessmentPublishService] [对应页面功能: 批量解锁操作]
@NeedLogin()
PATCH /api/assessment-instances/batch-unlock
Request Body: {
  instanceIds: string[];
  reason: string;
}
Response: {
  success: boolean;
  successCount: number;
  failedCount: number;
}

// 批量重发考核通知 [领域模型: AssessmentPublishService] [对应页面功能: 批量发送通知]
@NeedLogin()
POST /api/assessment-instances/batch-notify
Request Body: {
  instanceIds: string[];
}
Response: {
  success: boolean;
  successCount: number;
  failedCount: number;
}

// 扩展已发布列表查询接口，新增进度字段 [领域模型: AssessmentPublishService] [对应页面功能: 已发布列表进度展示]
GET /api/assessment-instances?period=xxx&page=1&pageSize=20&status=xxx
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
    publishedByName: string; // 新增：发布人姓名
    selfReviewCompleted: boolean; // 新增：自评是否完成
    supervisorReviewCompleted: boolean; // 新增：上级评分是否完成
  }>;
  total: number;
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "考核发布管理页"
        subgraph "概览统计"
            DB1[assessment_instance 表] --> M1[AssessmentPublishService]
            DB2[rating_record 表] --> M1
            M1 --> API1[GET /api/publish/statistics]
            API1 --> P[考核发布管理页]
        end
        
        subgraph "待发布列表"
            DB3[employee_binding 表] --> M1
            DB4[employee 表] --> M1
            M1 --> API2[GET /api/publish/employees]
            API2 --> P
        end
        
        subgraph "已发布列表"
            DB1 --> M1
            DB2 --> M1
            M1 --> API3[GET /api/assessment-instances]
            API3 --> P
        end
        
        subgraph "调整指标"
            DB5[assessment_indicator_snapshot 表] --> M1
            M1 --> API4[GET /api/assessment-instances/:id/indicators]
            API4 --> P
        end
        
        subgraph "批量操作"
            P --> API5[PATCH /api/assessment-instances/batch-unlock]
            P --> API6[POST /api/assessment-instances/batch-notify]
            API5 --> M1
            API6 --> M1
            M1 --> DB1
        end
    end
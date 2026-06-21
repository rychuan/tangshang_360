# 需求分析
## 需求描述
- 考核统计查询筛选条件改造：将考核周期、部门、岗位、等级筛选控件全部调整为下拉多选模式
  - 筛选条件全部支持多选，查询结果包含所有选中条件的并集
- 考核周期筛选参考考核发布管理的MonthPicker样式，支持选择多个考核周期
  - 年月选择界面与发布管理保持一致，可同时选中多个年月
- 部门筛选改为部门树多选，支持选择多个部门
  - 部门选项来自系统部门树，支持层级选择
- 岗位筛选改为下拉多选，选项动态加载系统所有岗位去重列表
  - 岗位数据从员工表中自动提取去重，无需手动配置
- 等级筛选改为下拉多选，支持选择多个绩效等级
  - 等级选项为S/A/B/C/D，可多选
- 员工选择保持现有UserSelect多选功能不变
  - 无需调整，保持现有交互

## 页面列表
### 考核统计查询页
1. 筛选栏改造：考核周期、部门、岗位、等级均改为多选控件
2. 查询逻辑适配：支持多条件组合查询
3. 筛选值展示：多选后在筛选器中显示已选项数量或标签
4. 数据展示保持现有表格和图表功能不变

# 技术方案
## 技术架构
- 前端：React 19 + Tailwind CSS + shadcn/ui + 自定义多选组件
- 后端：NestJS + Drizzle ORM + PostgreSQL
- 数据传输：前后端通过数组类型传递多选参数

## 页面路由与导航
无需调整，保持现有路由 `/statistics` 不变，导航项保持现有配置。

## 数据模型
### 数据库设计
无需新增或修改表结构，复用现有 `assessment_instance` 和 `employee` 表。

## 业务模型
### 领域模型
- **AssessmentStatisticsService**：改造现有查询逻辑，支持多选参数筛选

### API 设计
#### 考核统计查询页 相关

**页面路径**: /statistics

**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 多选考核周期查询 | API | GET /api/statistics/records |
| 多选部门查询 | API | GET /api/statistics/records |
| 多选岗位查询 | API | GET /api/statistics/records |
| 多选等级查询 | API | GET /api/statistics/records |
| 导出数据支持多选筛选 | API | GET /api/statistics/export |

**需实现的 API**：
- 统计记录查询接口升级支持多选参数
- 导出接口升级支持多选参数

**所需 API**:
```typescript
// 获取考核统计记录 [领域模型: AssessmentStatisticsService] [对应页面功能: 多条件筛选查询]
GET /api/statistics/records?page=1&pageSize=20&periods=2026-05,2026-04&departments=技术部,产品部&positions=前端开发,后端开发&grades=S,A&employeeIds=user1,user2
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

// 导出考核统计数据 [领域模型: AssessmentStatisticsService] [对应页面功能: 导出筛选后的数据]
GET /api/statistics/export?periods=2026-05,2026-04&departments=技术部,产品部&positions=前端开发,后端开发&grades=S,A&employeeIds=user1,user2
Response: Array<{
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
}>
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "考核统计查询页"
    DB1[assessment_instance 表] --> M1[AssessmentStatisticsService]
    DB2[employee 表] --> M1
    M1 --> API1[GET /api/statistics/records]
    API1 --> P1[考核统计查询页]
    
    M1 --> API2[GET /api/statistics/export]
    API2 --> P1
    end
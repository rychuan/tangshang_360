# 需求分析
## 需求描述
- 角色为中心的权限管理：替代现有员工逐个配置模式，支持自定义角色，基于角色批量配置权限
  - 验证条件：可创建/编辑/删除角色，角色权限配置一键应用到所有成员，无需逐个编辑员工权限
- 角色成员批量管理：支持批量分配/移除员工到角色，权限自动同步
  - 验证条件：角色详情页可搜索选择多个员工加入/移出角色，成员权限实时生效
- 权限可视化配置：矩阵式勾选配置角色权限，支持一键重置为预设权限
  - 验证条件：权限矩阵清晰展示所有资源和操作，勾选状态即时同步，支持重置操作
- 权限全链路生效：前端导航/按钮可见性、后端API都基于权限控制，不再仅过滤导航
  - 验证条件：无权限用户看不到对应导航、无法访问页面、调用API返回403
- 符合系统编码规范：修复现有技术债务
  - 验证条件：使用shadcn组件替代原生select，使用axiosForBackend替代fetch，符合项目编码规范

## 页面列表
### 角色管理页（原权限管理页重构）
1. 左侧角色列表：展示所有角色、成员数量、操作按钮（新增/编辑/删除角色）
2. 右侧权限配置区：矩阵式勾选配置当前选中角色的所有资源权限
3. 角色成员管理区：Tab切换展示该角色下的所有成员，支持批量添加/移除
4. 操作栏：保存权限配置、重置为角色预设按钮

# 技术方案
## 技术架构
- 前端：React 19 + Tailwind CSS + shadcn/ui + 平台内置`CanRole`组件
- 后端：NestJS + 平台内置`@CanRole`装饰器 + `AuthorizationSDK`（运行态角色管理）
- 权限体系：平台内置RBAC权限系统，无需自建权限表，兼容现有`employee.role`字段
- 权限校验：前端导航过滤 + 路由守卫 + 按钮级控制 + 后端API接口校验，全链路生效

## 页面路由与导航
### 页面路由
- `/permissions` → 角色管理页（复用原权限管理路由，无需新增）
### 导航设计
- 导航机制：页面路由
- 导航项：保留原「权限管理」导航入口，无需修改

## 业务模型
### 领域模型
- `AuthorizationService`：封装平台`AuthorizationSDK`，提供角色CRUD、成员管理、权限配置能力
- `PermissionGuardService`：统一权限校验逻辑，供后端API和前端使用

### API 设计
#### 角色管理页 相关
**页面路径**: /permissions
**功能全景**：
| 功能 | 实现方式 | 说明 |
|------|----------|------|
| 获取角色列表 | API | GET /api/auth/roles |
| 创建角色 | API | POST /api/auth/roles |
| 更新角色信息 | API | PUT /api/auth/roles/:id |
| 删除角色 | API | DELETE /api/auth/roles/:id |
| 获取角色权限配置 | API | GET /api/auth/roles/:id/permissions |
| 更新角色权限配置 | API | PUT /api/auth/roles/:id/permissions |
| 获取角色成员列表 | API | GET /api/auth/roles/:id/members |
| 批量添加角色成员 | API | POST /api/auth/roles/:id/members |
| 批量移除角色成员 | API | DELETE /api/auth/roles/:id/members |
| 权限校验 | 平台内置 | 后端`@CanRole`、前端`CanRole` |

**所需 API**:
```typescript
// 获取角色列表 [领域模型: AuthorizationService] [对应页面功能: 左侧角色列表展示]
GET /api/auth/roles
Response: {
  items: Array<{
    id: string;
    name: string;
    code: string; // 角色编码，对应employee.role字段
    description: string;
    memberCount: number;
    isSystem: boolean; // 是否系统内置角色（admin/employee等，不可删除）
    createdAt: string;
  }>;
}

// 创建角色 [领域模型: AuthorizationService] [对应页面功能: 新增角色]
POST /api/auth/roles
Request Body: {
  name: string;
  code: string;
  description?: string;
  permissions?: PermissionItem[];
}
Response: {
  id: string;
  success: boolean;
}

// 更新角色权限配置 [领域模型: AuthorizationService] [对应页面功能: 权限矩阵配置保存]
PUT /api/auth/roles/:id/permissions
Request Body: {
  permissions: PermissionItem[];
}
Response: {
  success: boolean;
}

// 批量添加角色成员 [领域模型: AuthorizationService] [对应页面功能: 批量添加成员]
POST /api/auth/roles/:id/members
Request Body: {
  employeeIds: string[];
}
Response: {
  success: boolean;
  addedCount: number;
}

// 批量移除角色成员 [领域模型: AuthorizationService] [对应页面功能: 批量移除成员]
DELETE /api/auth/roles/:id/members
Request Body: {
  employeeIds: string[];
}
Response: {
  success: boolean;
  removedCount: number;
}
```

### 数据流转链路图
```mermaid
graph LR
    subgraph "角色管理页"
    A[用户操作] --> B[前端权限校验]
    B --> C[AuthorizationService]
    C --> D[平台RBAC系统]
    D --> E[角色基础数据]
    D --> F[权限配置数据]
    D --> G[成员关系数据]
    G --> H[employee表role字段自动同步]
    end
    
    subgraph "全链路权限校验"
    I[前端路由/按钮] --> J[CanRole组件校验]
    K[后端API接口] --> L[@CanRole装饰器校验]
    J --> D
    L --> D
    end
```

## 兼容性与迁移方案
1. **现有角色兼容**：现有5种内置角色（admin/hrd/dept_head/supervisor/employee）自动同步为系统内置角色，不可删除，现有权限配置保留
2. **员工数据兼容**：现有`employee.role`字段与平台角色`code`字段自动映射，无需修改现有员工数据
3. **自定义权限迁移**：现有员工自定义权限自动迁移为独立自定义角色，成员自动关联，平滑过渡
4. **导航逻辑兼容**：现有Layout导航过滤逻辑保留，与新权限体系自动对齐

## 权限 Enforcement 改造
1. **后端API改造**：所有需要权限控制的API添加`@CanRole`装饰器，按角色校验权限
2. **前端按钮改造**：页面操作按钮使用`CanRole`组件包裹，无权限则隐藏
3. **路由守卫改造**：新增`ProtectedRoute`路由守卫，无权限用户访问页面自动跳转至403
4. **权限校验统一**：前后端权限规则保持一致，避免权限绕过风险
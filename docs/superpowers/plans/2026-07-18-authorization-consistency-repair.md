# Authorization Consistency Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据库中的期望角色、员工生命周期与 AuthorizationSDK 实际角色统一到可重试、可审计、失败关闭的授权状态机中。

**Architecture:** `employee` 保存完整期望角色、同步状态和版本，`authorization_sync_job` 保存持久化同步任务。所有角色变更先在数据库事务内写入新版本和任务，再由幂等同步服务收敛 SDK；动态权限和数据范围只接受 active、未删除且 `synced` 的员工。

**Tech Stack:** NestJS 10、TypeScript、Drizzle ORM、PostgreSQL、AuthorizationSDK、Jest、React 19。

## Global Constraints

- 数据库是期望授权状态的唯一持久化来源。
- AuthorizationSDK 失败、部分成功或任务乱序时必须 fail closed。
- 内置角色成员只能通过员工或部门生命周期服务修改。
- 所有管理员减少操作必须在 advisory lock 后重新读取目标和管理员集合。
- 自定义角色继续使用 self 数据范围。
- 不引入新的定时任务依赖；同步任务支持请求内处理和管理员重试。
- 每个任务必须先运行新增测试并确认失败，再修改生产代码。
- 不修改无关 Dashboard 设计代码。

---

### Task 1: 授权状态数据模型

**Files:**
- Create: `server/database/migrations/015_authorization_consistency.sql`
- Modify: `server/database/schema.ts`
- Create: `server/modules/role-manager/authorization-state.ts`
- Create: `test/unit/authorization-state.spec.ts`

**Interfaces:**
- Produces: `AuthorizationStatus = 'pending' | 'synced' | 'failed'`
- Produces: `normalizeAuthorizationRoles(roles: string[]): string[]`
- Produces: `effectiveAuthorizationRoles(employee): string[]`
- Produces: `authorizationSyncJob` Drizzle table.

- [ ] **Step 1: 写失败测试**

测试要求：

```ts
expect(normalizeAuthorizationRoles([' admin ', 'employee', 'admin', '']))
  .toEqual(['admin', 'employee']);

expect(effectiveAuthorizationRoles({
  status: true,
  deletedAt: null,
  authorizationRoles: ['admin'],
})).toEqual(['admin']);

expect(effectiveAuthorizationRoles({
  status: false,
  deletedAt: null,
  authorizationRoles: ['admin'],
})).toEqual([]);
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/authorization-state.spec.ts
```

Expected: FAIL，因为 `authorization-state.ts` 尚不存在。

- [ ] **Step 3: 添加迁移与 Schema**

`employee` 新增：

```ts
authorizationRoles: jsonb('authorization_roles').notNull().default('[]'),
authorizationStatus: varchar('authorization_status', { length: 20 })
  .notNull()
  .default('pending'),
authorizationVersion: integer('authorization_version').notNull().default(1),
authorizationError: text('authorization_error'),
authorizationUpdatedAt: customTimestamptz('authorization_updated_at', {
  precision: 6,
}).notNull().default(sql`CURRENT_TIMESTAMP`),
```

新增 `authorization_sync_job`：`id`、`employeeId`、`authorizationVersion`、
`status`、`attemptCount`、`errorMessage`、`startedAt`、`completedAt` 和系统时间字段。
迁移用现有 `employee.role` 生成初始 JSONB 角色数组，并将存量行设置为 `pending`。

- [ ] **Step 4: 实现纯函数并确认 GREEN**

`normalizeAuthorizationRoles` 去空格、去空值、去重并排序。
`effectiveAuthorizationRoles` 对 inactive 或 deleted 员工返回空数组。

Run:

```bash
npm test -- --runInBand test/unit/authorization-state.spec.ts
npm run type:check:server
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add server/database server/modules/role-manager/authorization-state.ts test/unit/authorization-state.spec.ts
git commit -m "feat: add durable authorization state"
```

### Task 2: 持久化 SDK 同步服务

**Files:**
- Create: `server/modules/role-manager/authorization-sync.service.ts`
- Modify: `server/modules/role-manager/role-manager.module.ts`
- Modify: `server/modules/role-manager/role-manager.service.ts`
- Create: `test/unit/authorization-sync.spec.ts`

**Interfaces:**
- Produces: `stageAuthorizationChange(tx, employeeId, desiredRoles): Promise<number>`
- Produces: `processEmployeeAuthorization(employeeId, version?): Promise<AuthorizationSyncResult>`
- Produces: `retryEmployeeAuthorization(employeeId): Promise<AuthorizationSyncResult>`
- Produces: `reconcileUserRoles(userId, desiredRoles): Promise<void>`

- [ ] **Step 1: 写同步服务失败测试**

覆盖：

```ts
it('removes stale privileged roles before adding desired roles');
it('marks matching version synced only after an exact SDK verification read');
it('marks matching version failed after a partial SDK failure');
it('does not mark an obsolete version synced');
it('retries a failed latest-version job idempotently');
```

部分失败用 `members.remove('admin')` 抛错复现，断言员工不能被更新为
`authorizationStatus='synced'`。

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/authorization-sync.spec.ts
```

Expected: FAIL，因为同步服务和 `reconcileUserRoles` 尚不存在。

- [ ] **Step 3: 实现严格角色收敛**

在 `RoleManagerService` 中实现：

```ts
async reconcileUserRoles(
  userId: string,
  desiredRoles: string[],
): Promise<void>
```

先移除 `current - desired`，再添加 `desired - current`，最后严格重读并比较排序后的
完整集合；任何差异都抛错并清理缓存。

- [ ] **Step 4: 实现任务状态机**

`stageAuthorizationChange` 在调用者事务中增加版本、写 pending 状态并插入任务。
`processEmployeeAuthorization` 只处理最新版本；旧任务标记 `superseded`。成功或失败更新
员工状态时必须同时匹配 `employeeId + authorizationVersion`。

- [ ] **Step 5: 确认 GREEN**

Run:

```bash
npm test -- --runInBand test/unit/authorization-sync.spec.ts test/unit/role-manager-strict.spec.ts
npm run type:check:server
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add server/modules/role-manager test/unit/authorization-sync.spec.ts test/unit/role-manager-strict.spec.ts
git commit -m "feat: add durable authorization reconciliation"
```

### Task 3: Fail-Closed 权限与数据范围

**Files:**
- Modify: `server/modules/role-manager/role-manager.service.ts`
- Modify: `server/common/access/access-scope.service.ts`
- Modify: `test/unit/role-manager-strict.spec.ts`
- Modify: `test/unit/access-scope.spec.ts`

**Interfaces:**
- Consumes: employee authorization state from Task 1.
- Produces: `hasSynchronizedActiveEmployee(userId): Promise<boolean>`.

- [ ] **Step 1: 写失败测试**

增加 pending、failed、inactive、deleted 四组用例，断言：

```ts
await expect(service.checkUserPermission(userId, 'employees', 'view'))
  .resolves.toBe(false);
await expect(accessScopeService.getScope(userId)).resolves.toEqual({
  kind: 'self',
  roles: [],
  departmentIds: [],
  subordinateIds: [],
});
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/role-manager-strict.spec.ts test/unit/access-scope.spec.ts
```

Expected: pending 和 failed 用例失败。

- [ ] **Step 3: 实现同步状态校验**

权限与范围查询增加 `authorization_status = 'synced'`。不得依赖客户端角色能力作为
后端授权依据。

- [ ] **Step 4: 确认 GREEN 并提交**

Run:

```bash
npm test -- --runInBand test/unit/role-manager-strict.spec.ts test/unit/access-scope.spec.ts
npm run type:check:server
git add server/common/access server/modules/role-manager test/unit
git commit -m "fix: fail closed on unsynchronized authorization"
```

### Task 4: 员工生命周期与管理员并发不变量

**Files:**
- Modify: `server/modules/employee-management/employee-management.service.ts`
- Modify: `server/modules/team-structure/team-structure.service.ts`
- Modify: `server/modules/bitable-sync/bitable-sync.service.ts`
- Modify: `server/modules/bitable-connection/bitable-connection.service.ts`
- Modify: `test/unit/employee-authorization-lifecycle.spec.ts`
- Modify: `test/unit/last-admin-concurrency.spec.ts`
- Modify: `test/unit/bitable-import-lifecycle.spec.ts`

**Interfaces:**
- Consumes: `AuthorizationSyncService`.
- Produces: lifecycle operations that stage desired authorization in the same DB transaction.

- [ ] **Step 1: 写生命周期失败测试**

覆盖：

```ts
it('re-reads the target role after acquiring the administrator lock');
it('leaves a demoted employee failed and unauthorized when SDK removal fails');
it('updates inactive desired roles without granting SDK roles');
it('treats repeated activation as an idempotent no-op');
it('activates from current durable desired roles instead of audit snapshots');
it('creates imported inactive employees directly as inactive');
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/employee-authorization-lifecycle.spec.ts test/unit/last-admin-concurrency.spec.ts test/unit/bitable-import-lifecycle.spec.ts
```

Expected: 新增场景失败。

- [ ] **Step 3: 统一生命周期写入**

为 `create` 增加内部 lifecycle options：

```ts
{
  initialStatus?: boolean;
  bitableConnectionId?: string;
}
```

所有角色变化调用 `stageAuthorizationChange`。管理员减少操作无条件先取得共享锁，再在
事务内重读目标员工；只有确认目标当前是 synced admin 时才执行最后管理员计数。

- [ ] **Step 4: 修复激活和导入**

已 active 的 `activate` 直接返回成功且不得同步 SDK。inactive 激活使用
`authorizationRoles`。两条 Bitable 导入路径用 `initialStatus:false` 创建 inactive
员工，不再先创建 active 再停用。

- [ ] **Step 5: 处理同步结果**

事务提交后调用 `processEmployeeAuthorization`。失败保持 `failed` 并传播错误；删除和
停用后的旧 SDK 角色因 fail-closed 不再产生后端能力。

- [ ] **Step 6: 确认 GREEN 并提交**

Run:

```bash
npm test -- --runInBand test/unit/employee-authorization-lifecycle.spec.ts test/unit/last-admin-concurrency.spec.ts test/unit/bitable-import-lifecycle.spec.ts
npm run type:check:server
git add server/modules/employee-management server/modules/team-structure server/modules/bitable-sync server/modules/bitable-connection test/unit
git commit -m "fix: make employee authorization lifecycle durable"
```

### Task 5: 角色管理边界与自锁保护

**Files:**
- Modify: `server/modules/role-manager/role-manager.controller.ts`
- Modify: `server/modules/role-manager/role-manager.service.ts`
- Modify: `shared/types/permission.types.ts`
- Modify: `test/unit/role-manager-strict.spec.ts`
- Create: `test/unit/role-manager-invariants.spec.ts`

**Interfaces:**
- Produces: `isBuiltinRole(roleBizId): boolean`
- Produces: runtime `normalizePermissionConfig(roleBizId, permissions)`.

- [ ] **Step 1: 写失败测试**

覆盖：

```ts
it.each(BUILTIN_ROLE_CODES)('rejects generic member mutation for %s');
it.each(BUILTIN_ROLE_CODES)('rejects deletion of built-in role %s');
it('rejects department, chat, all-employee and preset-group member payloads');
it('persists explicit custom-role user changes through authorization state');
it('prevents admin permission_management view or edit removal');
it('keeps local config when SDK custom-role deletion fails');
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/role-manager-invariants.spec.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现内置角色边界**

generic add/remove 仅允许 custom role + explicit `userList`。每个用户变更读取数据库
`authorizationRoles`、增加或删除 custom role、stage 任务并处理。内置角色删除和成员
变更返回 400。

- [ ] **Step 4: 实现权限配置校验**

只接受已知 resource/action，合并重复项，非 view action 自动包含 view。`admin` 必须
保留 `permission_management:view/edit`。删除 custom role 时先删 SDK，成功后再删本地
配置。

- [ ] **Step 5: 确认 GREEN 并提交**

Run:

```bash
npm test -- --runInBand test/unit/role-manager-invariants.spec.ts test/unit/role-manager-strict.spec.ts
npm run type:check:server
git add server/modules/role-manager shared/types/permission.types.ts test/unit
git commit -m "fix: enforce role administration invariants"
```

### Task 6: 部门角色与资源数据范围一致性

**Files:**
- Modify: `server/modules/department/department.service.ts`
- Modify: `server/modules/assessment-dashboard/assessment-dashboard.service.ts`
- Modify: `server/modules/employee-management/employee-management.service.ts`
- Modify: `server/modules/employee-management/employee-management.controller.ts`
- Modify: `client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx`
- Modify: `client/src/pages/EmployeeManagement/employee-management-permissions.ts`
- Modify: `test/unit/department-role-mutation.spec.ts`
- Modify: `test/unit/dashboard-permissions.spec.ts`
- Modify: `test/unit/employee-management-scope.spec.ts`
- Modify: `test/unit/employee-management-tabs.spec.ts`

**Interfaces:**
- Consumes: durable desired roles and sync service.
- Produces: permission-first composite tabs and scope-filtered position options.

- [ ] **Step 1: 写失败测试**

覆盖：

```ts
it('stages dept_head role changes instead of mutating SDK inside a DB transaction');
it('uses AccessScopeService managed IDs for dashboard todos');
it('filters employee positions by the caller employee scope');
it('shows departments and Bitable tabs to matching custom-role permissions');
```

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/department-role-mutation.spec.ts test/unit/dashboard-permissions.spec.ts test/unit/employee-management-scope.spec.ts test/unit/employee-management-tabs.spec.ts
```

Expected: FAIL。

- [ ] **Step 3: 修复部门与 Dashboard**

部门负责人变化在事务内更新期望角色和任务，事务外处理同步，不再从事务中直接调用
SDK。Dashboard todos 从 `AccessScopeService.getManagedEmployeeIds` 获取允许集合。

- [ ] **Step 4: 修复员工参考数据与前端**

`GET /api/employees/positions` 传入 userId 并使用
`buildEmployeeScopeCondition({ includeSelf:true })`。员工管理页签只检查动态 view 权限，
移除普通业务 `identityRoles` 计算。

- [ ] **Step 5: 确认 GREEN 并提交**

Run:

```bash
npm test -- --runInBand test/unit/department-role-mutation.spec.ts test/unit/dashboard-permissions.spec.ts test/unit/employee-management-scope.spec.ts test/unit/employee-management-tabs.spec.ts
npm run type:check
git add server/modules/department server/modules/assessment-dashboard server/modules/employee-management client/src/pages/EmployeeManagement test/unit
git commit -m "fix: align authorization data scopes"
```

### Task 7: Bootstrap、重试 API 与最终验证

**Files:**
- Create: `scripts/bootstrap-authorization-state.ts`
- Modify: `server/modules/role-manager/role-manager.controller.ts`
- Modify: `client/src/api/role-manager.ts`
- Modify: `shared/api.interface.ts`
- Create: `test/unit/authorization-bootstrap.spec.ts`
- Modify: `test/unit/backend-capability-role-consistency.spec.ts`

**Interfaces:**
- Produces: `bootstrapAuthorizationState(): Promise<BootstrapResult>`
- Produces: `POST /api/role_manager/authorization/:employeeId/retry`

- [ ] **Step 1: 写失败测试**

覆盖 bootstrap 严格读取完整 built-in/custom SDK 角色、失败即不标记 synced、重试 API
只能使用数据库期望角色。

- [ ] **Step 2: 确认 RED**

Run:

```bash
npm test -- --runInBand test/unit/authorization-bootstrap.spec.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 bootstrap 与重试**

bootstrap 使用 Nest application context 获取同步服务，逐员工严格读取 SDK 并写入完整
角色集；任一失败设置非零退出码。重试 API 使用 `admin` 身份和
`permission_management:edit`，不接受角色数组。

- [ ] **Step 4: 运行完整验证**

Run:

```bash
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

Expected: 所有命令 exit 0。

- [ ] **Step 5: 独立代码审查**

审查 `f709b4b..HEAD`，重点检查最后管理员、任务乱序、失败关闭、迁移顺序和 SDK
部分失败。修复所有 Critical/Important 后重新运行完整验证。

- [ ] **Step 6: 提交**

```bash
git add scripts server client shared test
git commit -m "feat: complete authorization consistency repair"
```

### Task 8: 本地合并

**Files:**
- No source changes expected.

- [ ] **Step 1: 在功能分支执行最终验证**

Run:

```bash
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

- [ ] **Step 2: 本地合并到 `sprint/default`**

从主工作区执行：

```bash
git checkout sprint/default
git merge --no-ff codex/permission-review-fixes -m "merge: repair authorization consistency"
```

- [ ] **Step 3: 合并后再次验证**

Run:

```bash
npm test -- --runInBand
npm run type:check
npm run lint
```

- [ ] **Step 4: 清理已合并 worktree 和分支**

```bash
git worktree remove .worktrees/permission-review-fixes
git worktree prune
git branch -d codex/permission-review-fixes
```

禁止推送远端。

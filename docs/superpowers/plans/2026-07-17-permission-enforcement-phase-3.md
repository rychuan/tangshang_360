# Permission Enforcement Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fixed built-in-role barriers from ordinary business capabilities so custom roles can use every route, API, tab, and command granted by the dynamic permission matrix.

**Architecture:** `@RequirePermission(resource, action)` and `CanDo` remain the normal capability boundaries. Backend `@CanRole` and frontend identity-role checks remain only for role/permission administration; roles continue to determine default permissions and data scope through `RoleManagerService` and `AccessScopeService`.

**Tech Stack:** NestJS 10, React 19, TypeScript, Jest, React DOM server rendering, Lark APAAS authorization toolkit.

## Global Constraints

- Dynamic resource permissions determine capability.
- Roles determine default permissions and data scope, not ordinary business capability.
- Custom roles default to self data scope until a separate scope model exists.
- Permission and role administration remains identity-sensitive.
- Permission bootstrap endpoints remain login-protected and permission-free.
- Existing object and collection data-scope checks must remain unchanged.
- Permission loading and authorization failures fail closed.
- Preserve unrelated Dashboard worktree changes.
- Follow red-green-refactor and commit each task independently.

---

### Task 1: Remove Backend Business Role Allowlists

**Files:**
- Create: `test/unit/backend-capability-role-consistency.spec.ts`
- Modify: `server/modules/assessment-dashboard/assessment-dashboard.controller.ts`
- Modify: `server/modules/assessment-operation/assessment-operation.controller.ts`
- Modify: `server/modules/assessment-publish/assessment-publish.controller.ts`
- Modify: `server/modules/assessment-statistics/assessment-statistics.controller.ts`
- Modify: `server/modules/assessment-template/assessment-template.controller.ts`
- Modify: `server/modules/bitable-connection/bitable-connection.controller.ts`
- Modify: `server/modules/bitable-sync/bitable-sync.controller.ts`
- Modify: `server/modules/department/department.controller.ts`
- Modify: `server/modules/employee-management/employee-management.controller.ts`
- Modify: `server/modules/my-assessment/my-assessment.controller.ts`
- Modify: `server/modules/performance-grade/performance-grade.controller.ts`
- Modify: `server/modules/system-dict/system-dict.controller.ts`
- Modify: `server/modules/team-performance/team-performance.controller.ts`
- Modify: `server/modules/team-structure/team-structure.controller.ts`
- Preserve: `server/modules/role-manager/role-manager.controller.ts`

**Interfaces:**
- Consumes: existing `@RequirePermission(resource, action)`.
- Produces: ordinary controllers with no `@CanRole` decorators.
- Preserves: role-manager identity restrictions and permission bootstrap endpoints.

- [ ] **Step 1: Write the failing backend inventory test**

```ts
import fs from 'node:fs';
import path from 'node:path';

const controllerRoot = path.resolve(__dirname, '../../server/modules');
const identitySensitive = new Set(['role-manager.controller.ts']);

describe('backend capability role consistency', () => {
  it('keeps fixed role decorators only on identity-sensitive controllers', () => {
    const violations: string[] = [];

    for (const moduleName of fs.readdirSync(controllerRoot)) {
      const modulePath = path.join(controllerRoot, moduleName);
      if (!fs.statSync(modulePath).isDirectory()) continue;

      for (const fileName of fs.readdirSync(modulePath)) {
        if (!fileName.endsWith('.controller.ts')) continue;
        if (identitySensitive.has(fileName)) continue;

        const source = fs.readFileSync(path.join(modulePath, fileName), 'utf8');
        if (source.includes('@CanRole(')) {
          violations.push(`${moduleName}/${fileName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps role-manager identity restrictions', () => {
    const source = fs.readFileSync(
      path.join(controllerRoot, 'role-manager/role-manager.controller.ts'),
      'utf8',
    );
    expect(source).toContain("@CanRole(['admin', 'hrd'])");
    expect(source).toContain("@CanRole(['admin'])");
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- --runInBand test/unit/backend-capability-role-consistency.spec.ts
```

Expected: FAIL listing ordinary controllers that still contain `@CanRole`.

- [ ] **Step 3: Remove ordinary backend role decorators**

For every controller listed above except `role-manager.controller.ts`:

- remove every `@CanRole(...)` decorator;
- remove `CanRole` from imports;
- retain every `@RequirePermission`;
- retain existing `@NeedLogin` on mutations;
- add `@NeedLogin()` to `EmployeeManagementController.getMyPermissions`, which is a legacy permission bootstrap endpoint without a resource permission.

No service-level access-scope or workflow validation changes are part of this task.

- [ ] **Step 4: Verify backend capability enforcement**

Run:

```bash
npm test -- --runInBand test/unit/backend-capability-role-consistency.spec.ts
npm run type:check:server
```

Expected: inventory test and server type check exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/modules test/unit/backend-capability-role-consistency.spec.ts
git commit -m "fix: remove backend business role allowlists"
```

### Task 2: Make Routes and Navigation Permission-First

**Files:**
- Modify: `client/src/components/ProtectedRoute.tsx`
- Modify: `client/src/components/navigation.ts`
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/app.tsx`
- Modify: `test/unit/client-permission-components.spec.ts`
- Modify: `test/unit/client-permission-policy.spec.ts`

**Interfaces:**
- Produces: `ProtectedRoute` with `resources` and optional `identityRoles`.
- Produces: `NavItem.identityRoles?`.
- Preserves: identity-role restriction only for `/permissions`.

- [ ] **Step 1: Add failing custom-role component tests**

Add to `client-permission-components.spec.ts`:

```ts
it('allows an unknown custom role when resource permission matches', () => {
  mockRoles = [];
  mockPermissions = [{ resource: 'statistics', actions: ['view'] }];

  const html = renderToStaticMarkup(
    React.createElement(
      ProtectedRoute,
      { resources: ['statistics'] },
      React.createElement('span', { 'data-page': 'custom-role' }),
    ),
  );

  expect(html).toContain('data-page="custom-role"');
});

it('retains explicit identity-role restrictions', () => {
  mockRoles = [];
  mockPermissions = [
    { resource: 'permission_management', actions: ['view'] },
  ];

  const html = renderToStaticMarkup(
    React.createElement(
      ProtectedRoute,
      {
        resources: ['permission_management'],
        identityRoles: ['admin', 'hrd'],
      },
      React.createElement('span', { 'data-page': 'permissions' }),
    ),
  );

  expect(html).toContain('data-navigate="/403"');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- --runInBand test/unit/client-permission-components.spec.ts
```

Expected: FAIL because `roles` is required and `identityRoles` is unsupported.

- [ ] **Step 3: Implement optional identity restrictions**

Change `ProtectedRouteProps` to:

```ts
interface ProtectedRouteProps {
  resources?: PermissionResource[];
  identityRoles?: string[];
  children: React.ReactNode;
}
```

Authorization succeeds when:

- authentication and permission loading are complete;
- `ability` exists;
- at least one required resource has `view`;
- when `identityRoles` is provided, `ability` matches one of them.

- [ ] **Step 4: Remove ordinary route and navigation roles**

- Remove `roles` from ordinary `ProtectedRoute` calls in `app.tsx`.
- Use `identityRoles={['admin', 'hrd']}` only for `/permissions`.
- Replace `NavItem.roles` with optional `identityRoles`.
- Set `identityRoles: ['admin', 'hrd']` only on the 权限管理 item.
- In `Layout`, filter by dynamic permission first and apply `identityRoles` only when declared.
- Remove unused role-constant imports.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand test/unit/client-permission-components.spec.ts test/unit/client-permission-policy.spec.ts
npm run type:check:client
```

Expected: focused tests and client type check exit 0.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ProtectedRoute.tsx client/src/components/navigation.ts client/src/components/Layout.tsx client/src/app.tsx test/unit/client-permission-components.spec.ts test/unit/client-permission-policy.spec.ts
git commit -m "fix: make routes permission first"
```

### Task 3: Remove Employee Management Role Barriers

**Files:**
- Modify: `client/src/pages/EmployeeManagement/employee-management-permissions.ts`
- Modify: `client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx`
- Modify: `client/src/pages/EmployeeManagement/EmployeeListTab.tsx`
- Modify: `client/src/pages/EmployeeManagement/EmployeeTable.tsx`
- Modify: `client/src/pages/EmployeeManagement/DepartmentManagementTab.tsx`
- Modify: `client/src/pages/EmployeeManagement/BitableConnectionTab.tsx`
- Modify: `test/unit/employee-management-tabs.spec.ts`

**Interfaces:**
- `getVisibleEmployeeManagementTabs(permissions)` no longer accepts roles.
- `getEmployeeListCapabilities(permissions)` no longer accepts roles.
- `getDepartmentCommandCapabilities(permissions)` no longer accepts roles.
- Permission administration components keep their existing `CanRole`.

- [ ] **Step 1: Rewrite tests for custom-role permissions**

Use permission-only expectations:

```ts
expect(
  getVisibleEmployeeManagementTabs([
    { resource: 'organization', actions: ['view'] },
  ]),
).toEqual(['departments']);

expect(
  getEmployeeListCapabilities([
    { resource: 'employees', actions: ['view', 'edit'] },
    { resource: 'employee_binding', actions: ['view', 'edit'] },
  ]),
).toEqual({
  loadTemplates: true,
  showBindings: true,
  showSelection: true,
  showActions: true,
});

expect(
  getDepartmentCommandCapabilities([
    { resource: 'organization', actions: ['view', 'delete'] },
  ]),
).toEqual({ canEdit: false, canDelete: true });
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- --runInBand test/unit/employee-management-tabs.spec.ts
```

Expected: FAIL because the policies still require built-in roles.

- [ ] **Step 3: Make employee management policies permission-only**

- Employee tab: `employees:view`.
- Department tab: `organization:view`.
- Bitable tab: `employees:view`.
- Binding template loading and selection: `employee_binding:edit`.
- Binding columns: `employee_binding:view`.
- Employee actions: matching `employees` or `employee_binding` actions.
- Department actions: matching `organization:edit/delete`.

- [ ] **Step 4: Remove ordinary `CanRole` wrappers**

Remove `CanRole`, `useAuth`, `ROLE_SUBJECT`, and built-in-role calculations from the employee list, table, department, and Bitable components. Keep every corresponding `CanDo`.

Do not change:

- `RoleListPanel.tsx`
- `RoleMembersTab.tsx`
- `PermissionMatrixTab.tsx`

Those components remain identity-sensitive.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand test/unit/employee-management-tabs.spec.ts test/unit/client-permission-components.spec.ts
npm run type:check:client
```

Expected: tests and client type check exit 0.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/EmployeeManagement test/unit/employee-management-tabs.spec.ts test/unit/client-permission-components.spec.ts
git commit -m "fix: allow custom roles in employee management"
```

### Task 4: Remove Remaining Frontend Business Role Barriers

**Files:**
- Create: `test/unit/frontend-capability-role-consistency.spec.ts`
- Modify: `client/src/pages/TemplateManagement/TemplateManagementPage.tsx`
- Modify: `client/src/pages/PublishManagement/PendingPublishSection.tsx`
- Modify: `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
- Modify: `client/src/pages/Statistics/StatisticsPage.tsx`
- Modify: `client/src/pages/TeamPerformance/TeamPerformancePage.tsx`
- Modify: `client/src/pages/GradeConfig/GradeConfigPage.tsx`
- Preserve: `client/src/pages/EmployeeManagement/RoleListPanel.tsx`
- Preserve: `client/src/pages/EmployeeManagement/RoleMembersTab.tsx`
- Preserve: `client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx`

**Interfaces:**
- Ordinary mutation and export controls use only `CanDo`.
- Permission administration controls retain `CanRole`.

- [ ] **Step 1: Write the failing frontend inventory test**

```ts
import fs from 'node:fs';
import path from 'node:path';

const clientRoot = path.resolve(__dirname, '../../client/src');
const identitySensitive = new Set([
  'pages/EmployeeManagement/RoleListPanel.tsx',
  'pages/EmployeeManagement/RoleMembersTab.tsx',
  'pages/EmployeeManagement/PermissionMatrixTab.tsx',
]);

function walk(directory: string): string[] {
  return fs.readdirSync(directory).flatMap((name) => {
    const fullPath = path.join(directory, name);
    return fs.statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

it('keeps CanRole only on permission administration controls', () => {
  const violations = walk(clientRoot)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => {
      const relative = path.relative(clientRoot, file);
      return (
        !identitySensitive.has(relative) &&
        fs.readFileSync(file, 'utf8').includes('<CanRole')
      );
    })
    .map((file) => path.relative(clientRoot, file));

  expect(violations).toEqual([]);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- --runInBand test/unit/frontend-capability-role-consistency.spec.ts
```

Expected: FAIL listing business UI files that still use `CanRole`.

- [ ] **Step 3: Remove redundant business role wrappers**

- Template create/deactivate/delete: retain `template_management:edit/delete`.
- Publish, adjust, snapshot, return, unlock, reminders, and history: retain matching `publish_management` actions.
- Statistics export and PDF: retain `statistics:export`.
- Statistics Bitable synchronization: add `CanDo statistics:export` before removing its role wrapper.
- Team reminder controls: retain `team_performance:edit`.
- Grade create/edit/delete: retain `grade_config:edit`.
- Remove unused `CanRole` imports.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runInBand test/unit/frontend-capability-role-consistency.spec.ts
npm run type:check:client
```

Expected: inventory test and client type check exit 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages test/unit/frontend-capability-role-consistency.spec.ts
git commit -m "fix: remove frontend business role barriers"
```

### Task 5: Phase 3 Review Gate

**Files:**
- Review: all Phase 3 changes.

- [ ] **Step 1: Run static conflict scans**

```bash
rg -n "@CanRole\\(" server/modules -g "*.controller.ts"
rg -n "<CanRole|CanRole roles" client/src -g "*.tsx" -g "*.ts"
```

Expected:

- backend matches only `role-manager.controller.ts`;
- frontend matches only the three permission-administration components.

- [ ] **Step 2: Run final verification**

```bash
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

Expected: all commands exit 0 and Jest reports zero failures.

- [ ] **Step 3: Request code review**

Review against:

```text
docs/superpowers/specs/2026-07-17-permission-enforcement-design.md
```

Reject the phase if:

- a normal business endpoint still contains `@CanRole`;
- a normal business command still contains `CanRole`;
- a custom role with the correct permission is rejected before data-scope checks;
- role/permission administration loses its explicit identity restriction.

Fix every Critical or Important finding before merging.

# Permission Enforcement Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make frontend routes, navigation, composite tabs, and command visibility consistently reflect the effective permission matrix.

**Architecture:** Add pure permission-policy helpers shared by navigation and route guards. Keep current role checks until Phase 3 removes backend `@CanRole` conflicts, while adding resource/action checks everywhere the frontend currently exposes a page or command that the backend can reject.

**Tech Stack:** React 19, TypeScript, React Router 6, TanStack Query, shadcn/ui, Jest, ts-jest.

## Global Constraints

- Dynamic resource permissions determine capability.
- Phase 2 must remain compatible with current backend fixed-role allowlists.
- Permission loading fails closed.
- Navigation hiding is not route protection.
- Composite tabs must not mount or fetch when their permission is denied.
- Preserve the existing page layout and visual styling.
- Preserve unrelated user changes.
- Follow red-green-refactor for behavior changes.

---

### Task 1: Resource-Aware Route and Navigation Policy

**Files:**
- Create: `client/src/components/permission-policy.ts`
- Modify: `client/src/components/ProtectedRoute.tsx`
- Modify: `client/src/components/navigation.ts`
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/app.tsx`
- Test: `test/unit/client-permission-policy.spec.ts`

**Interfaces:**
- Produces: `hasPermission(permissions, resource, action)`
- Produces: `hasAnyViewPermission(permissions, resources)`
- Extends: `ProtectedRoute` with `resources?: PermissionResource[]`
- Extends: `NavItem` with `permissionResources?: PermissionResource[]`

- [ ] **Step 1: Write failing pure policy tests**

```ts
import {
  hasAnyViewPermission,
  hasPermission,
} from '../../client/src/components/permission-policy';

const permissions = [
  { resource: 'employees' as const, actions: ['view' as const] },
  { resource: 'organization' as const, actions: ['view', 'edit'] as const },
];

describe('client permission policy', () => {
  it('matches an exact resource action', () => {
    expect(hasPermission(permissions, 'organization', 'edit')).toBe(true);
    expect(hasPermission(permissions, 'employees', 'edit')).toBe(false);
  });

  it('allows a composite page when any view permission matches', () => {
    expect(
      hasAnyViewPermission(permissions, ['employees', 'organization']),
    ).toBe(true);
    expect(hasAnyViewPermission(permissions, ['statistics'])).toBe(false);
  });

  it('fails closed when permissions or requirements are empty', () => {
    expect(hasAnyViewPermission([], ['employees'])).toBe(false);
    expect(hasAnyViewPermission(permissions, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/client-permission-policy.spec.ts`

Expected: FAIL because `permission-policy.ts` does not exist.

- [ ] **Step 3: Implement the pure policy**

```ts
export function hasPermission(
  permissions: PermissionItem[],
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return permissions.some(
    (item) => item.resource === resource && item.actions.includes(action),
  );
}

export function hasAnyViewPermission(
  permissions: PermissionItem[],
  resources: PermissionResource[],
): boolean {
  return (
    resources.length > 0 &&
    resources.some((resource) =>
      hasPermission(permissions, resource, 'view'),
    )
  );
}
```

- [ ] **Step 4: Apply resource checks to `ProtectedRoute`**

Read `permissions` and `loading` from `usePermissions`. While either auth or
permission data is loading, render the existing loading state. Require both:

- one matching fixed role;
- one matching resource `view` permission when `resources` is provided.

Redirect denied users to `/403`.

- [ ] **Step 5: Declare route resource requirements**

Pass these resources from `app.tsx`:

```ts
dashboard -> ['dashboard']
template-management -> ['template_management']
publish-management -> ['publish_management']
assessment/:id -> ['my_assessments']
statistics -> ['statistics']
my-assessments -> ['my_assessments']
team-performance -> ['team_performance']
employees -> ['employees', 'organization']
employees/:id -> ['employees']
permissions -> ['permission_management']
grade-config -> ['grade_config']
dictionary and dictionary/:type -> ['dictionary_config']
```

- [ ] **Step 6: Reuse the same policy in navigation**

Replace `permissionResource` with `permissionResources`. The employee-management
navigation item uses `['employees', 'organization']`; all other items use a
single-element array. `Layout` calls `hasAnyViewPermission`.

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- --runInBand test/unit/client-permission-policy.spec.ts
npm run type:check:client
```

Expected: focused tests and client type check exit 0.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/permission-policy.ts client/src/components/ProtectedRoute.tsx client/src/components/navigation.ts client/src/components/Layout.tsx client/src/app.tsx test/unit/client-permission-policy.spec.ts
git commit -m "fix: enforce resource permissions on frontend routes"
```

### Task 2: Permission-Aware Employee Management Tabs

**Files:**
- Create: `client/src/pages/EmployeeManagement/employee-management-permissions.ts`
- Modify: `client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx`
- Test: `test/unit/employee-management-tabs.spec.ts`

**Interfaces:**
- Produces: `getVisibleEmployeeManagementTabs(permissions, roles)`
- Produces: `getDefaultEmployeeManagementTab(tabs)`

- [ ] **Step 1: Write failing tab-policy tests**

```ts
import { DEFAULT_PERMISSIONS } from '../../shared/api.interface';
import {
  getDefaultEmployeeManagementTab,
  getVisibleEmployeeManagementTabs,
} from '../../client/src/pages/EmployeeManagement/employee-management-permissions';

describe('employee management tab permissions', () => {
  it('shows supervisors only the employee list', () => {
    expect(
      getVisibleEmployeeManagementTabs(
        DEFAULT_PERMISSIONS.supervisor,
        ['supervisor'],
      ),
    ).toEqual(['employees']);
  });

  it('shows department heads employee and department tabs', () => {
    expect(
      getVisibleEmployeeManagementTabs(
        DEFAULT_PERMISSIONS.dept_head,
        ['dept_head'],
      ),
    ).toEqual(['employees', 'departments']);
  });

  it('shows HRD all currently supported tabs', () => {
    expect(
      getVisibleEmployeeManagementTabs(DEFAULT_PERMISSIONS.hrd, ['hrd']),
    ).toEqual(['employees', 'departments', 'bitable']);
  });

  it('defaults to the first visible tab', () => {
    expect(getDefaultEmployeeManagementTab(['departments'])).toBe(
      'departments',
    );
    expect(getDefaultEmployeeManagementTab([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/employee-management-tabs.spec.ts`

Expected: FAIL because the tab policy module does not exist.

- [ ] **Step 3: Implement current-backend-compatible tab policy**

Use these requirements:

- `employees`: `employees:view` and one of `admin/hrd/dept_head/supervisor`.
- `departments`: `organization:view` and one of `admin/hrd/dept_head`.
- `bitable`: `employees:view` and one of `admin/hrd`.

The function returns tabs in the fixed order
`employees`, `departments`, `bitable`.

- [ ] **Step 4: Render only allowed tabs and content**

In `EmployeeManagementPage`:

- obtain effective permissions from `usePermissions`;
- obtain role ability from `useAuth`;
- compute visible tabs;
- use a controlled tab value;
- reset the active tab to the first allowed tab when permissions change;
- do not render denied `TabsTrigger` or `TabsContent`;
- render the existing 403-style empty state when no tab is allowed.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand test/unit/employee-management-tabs.spec.ts
npm run type:check:client
```

Expected: focused tests and client type check exit 0.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/EmployeeManagement/employee-management-permissions.ts client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx test/unit/employee-management-tabs.spec.ts
git commit -m "fix: gate employee management tabs"
```

### Task 3: Align Command Visibility With Backend Actions

**Files:**
- Modify: `client/src/components/permission-policy.ts`
- Modify: `client/src/pages/EmployeeManagement/DepartmentManagementTab.tsx`
- Modify: `client/src/pages/DictionaryConfig/DictionaryConfigPage.tsx`
- Modify: `client/src/pages/EmployeeManagement/EmployeeListTab.tsx`
- Modify: `client/src/pages/EmployeeManagement/EmployeeTable.tsx`
- Modify: `client/src/pages/EmployeeManagement/BitableConnectionTab.tsx`
- Test: `test/unit/client-permission-policy.spec.ts`

**Interfaces:**
- Consumes: existing `CanRole`, `CanDo`, and `usePermission`
- Produces: `COMMAND_PERMISSIONS`
- Uses the same resource/action pairs as backend controllers

- [ ] **Step 1: Extend the failing policy test for command mappings**

Before editing components, add:

```ts
import { COMMAND_PERMISSIONS } from '../../client/src/components/permission-policy';

it('maps commands to the same resource actions used by backend endpoints', () => {
  expect(COMMAND_PERMISSIONS).toMatchObject({
    departmentEdit: { resource: 'organization', action: 'edit' },
    departmentDelete: { resource: 'organization', action: 'delete' },
    dictionaryEdit: { resource: 'dictionary_config', action: 'edit' },
    employeeSync: { resource: 'employees', action: 'edit' },
    employeeBindingEdit: {
      resource: 'employee_binding',
      action: 'edit',
    },
    employeeBindingView: {
      resource: 'employee_binding',
      action: 'view',
    },
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/client-permission-policy.spec.ts`

Expected: FAIL because `COMMAND_PERMISSIONS` does not exist.

- [ ] **Step 3: Implement and consume command mappings**

Add immutable mappings to `permission-policy.ts`:

```ts
export const COMMAND_PERMISSIONS = {
  departmentEdit: { resource: 'organization', action: 'edit' },
  departmentDelete: { resource: 'organization', action: 'delete' },
  dictionaryEdit: { resource: 'dictionary_config', action: 'edit' },
  employeeSync: { resource: 'employees', action: 'edit' },
  employeeBindingEdit: { resource: 'employee_binding', action: 'edit' },
  employeeBindingView: { resource: 'employee_binding', action: 'view' },
} as const satisfies Record<
  string,
  { resource: PermissionResource; action: PermissionAction }
>;
```

Pass mappings to `CanDo` with
`<CanDo {...COMMAND_PERMISSIONS.departmentEdit}>`.

- [ ] **Step 4: Gate department commands**

- New/edit/add-child/save: `CanRole admin/hrd/dept_head` plus
  `CanDo organization:edit`.
- Delete: `CanRole admin` plus `CanDo organization:delete`.
- Hide the operation column when neither edit nor delete is available.

- [ ] **Step 5: Gate dictionary commands**

Wrap new, edit, delete, save, and delete confirmation commands with
`CanDo dictionary_config:edit`. View-only users retain the table without
mutation controls.

- [ ] **Step 6: Gate employee synchronization and binding commands**

- Batch bind: `CanRole admin/hrd` plus `CanDo employee_binding:edit`.
- Bitable import/export synchronization: `CanRole admin/hrd` plus
  `CanDo employees:edit`.
- Binding history: `CanDo employee_binding:view`.

- [ ] **Step 7: Gate Bitable connection commands**

- Create/update/delete: retain current role checks and add
  `CanDo employees:edit`.
- Import/export: retain `admin/hrd` and add `CanDo employees:edit`.
- Log viewing remains `employees:view`, already guaranteed by the visible tab.

- [ ] **Step 8: Verify Phase 2**

Run:

```bash
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

Expected: all commands exit 0 and Jest reports zero failures.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/permission-policy.ts client/src/pages/EmployeeManagement/DepartmentManagementTab.tsx client/src/pages/DictionaryConfig/DictionaryConfigPage.tsx client/src/pages/EmployeeManagement/EmployeeListTab.tsx client/src/pages/EmployeeManagement/EmployeeTable.tsx client/src/pages/EmployeeManagement/BitableConnectionTab.tsx test/unit/client-permission-policy.spec.ts
git commit -m "fix: align frontend commands with permissions"
```

### Task 4: Phase 2 Review Gate

**Files:**
- Review: all files changed by Tasks 1-3

- [ ] **Step 1: Review the complete phase diff**

Confirm direct URLs require resource view permission, denied tabs do not mount,
and every changed command uses the same action as its backend endpoint.

- [ ] **Step 2: Run final verification**

```bash
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

- [ ] **Step 3: Request code review**

Review the phase against
`docs/superpowers/specs/2026-07-17-permission-enforcement-design.md`. Fix every
Critical or Important finding before merging.

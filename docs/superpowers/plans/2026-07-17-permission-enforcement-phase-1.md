# Permission Enforcement Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk permission gaps in Dashboard access, employee data scope, statistical PDF export, and published-assessment export.

**Architecture:** Extend the shared permission model, reuse `AccessScopeService` for collection and object scope enforcement, and route every protected export through an API carrying the matching export permission. Existing page rendering and file-generation code remains in place, but it may only consume data returned by the new protected endpoints.

**Tech Stack:** NestJS 10, React 19, TypeScript, Drizzle ORM, Jest, ts-jest.

## Global Constraints

- Dynamic resource permissions determine capability.
- Roles determine default permissions and data scope.
- `admin` and `hrd` have global scope.
- `dept_head` has managed-department scope.
- `supervisor` has direct-subordinate scope.
- `employee` and custom roles default to self scope.
- Preserve unrelated uncommitted frontend changes.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Protect and Scope Dashboard

**Files:**
- Modify: `shared/types/permission.types.ts`
- Modify: `client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx`
- Modify: `server/modules/assessment-dashboard/assessment-dashboard.controller.ts`
- Modify: `server/modules/assessment-dashboard/assessment-dashboard.service.ts`
- Modify: `server/modules/assessment-dashboard/assessment-dashboard.module.ts`
- Test: `test/unit/dashboard-permissions.spec.ts`

**Interfaces:**
- Consumes: `AccessScopeService.getScope(userId)`
- Produces: permission resource `dashboard`; `dashboardEmployeeIds(scope, userId, managedEmployeeIds)` returning employee IDs or global scope for Dashboard queries

- [ ] **Step 1: Write the failing permission metadata and scope tests**

```ts
import 'reflect-metadata';
import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { AssessmentDashboardController } from '../../server/modules/assessment-dashboard/assessment-dashboard.controller';
import { dashboardEmployeeIds } from '../../server/modules/assessment-dashboard/assessment-dashboard.service';

describe('dashboard permission enforcement', () => {
  it('requires dashboard view permission', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      AssessmentDashboardController.prototype.overview,
    );
    expect(metadata).toEqual({ resource: 'dashboard', action: 'view' });
  });

  it('uses managed employee ids for department heads and supervisors', () => {
    expect(
      dashboardEmployeeIds(
        {
          kind: 'managed',
          roles: ['dept_head'],
          departmentIds: ['dept-1'],
          subordinateIds: ['user-2'],
        },
        'user-1',
        ['user-2', 'user-3'],
      ),
    ).toEqual(['user-2', 'user-3']);
  });

  it('uses self for self-scoped users', () => {
    expect(
      dashboardEmployeeIds(
        {
          kind: 'self',
          roles: ['employee'],
          departmentIds: [],
          subordinateIds: [],
        },
        'user-1',
        [],
      ),
    ).toEqual(['user-1']);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/dashboard-permissions.spec.ts`

Expected: FAIL because `dashboard` and `dashboardEmployeeIds` do not exist and the controller has no permission metadata.

- [ ] **Step 3: Add the permission resource and default grants**

Add `dashboard` to `PermissionResource`, expose `dashboard:view` in the matrix, and grant it to all five built-in roles.

- [ ] **Step 4: Apply Dashboard permission and access scope**

Add `@RequirePermission('dashboard', 'view')` to both Dashboard endpoints. Import `AccessScopeModule`, inject `AccessScopeService`, and replace the current `dept_head -> hrd` classification with scope-based filtering:

```ts
export function dashboardEmployeeIds(
  scope: AccessScope,
  userId: string,
  managedEmployeeIds: string[],
): string[] | null {
  if (scope.kind === 'global') return null;
  if (scope.kind === 'self') return [userId];
  return Array.from(new Set(managedEmployeeIds));
}
```

Call `getScope(userId)` first. Global scope keeps unfiltered company totals.
Managed scope calls `getManagedEmployeeIds(userId, { includeSelf: true })` and
filters to those employees. Self scope filters to the current employee.

- [ ] **Step 5: Run focused tests and type checks**

Run:

```bash
npm test -- --runInBand test/unit/dashboard-permissions.spec.ts
npm run type:check:server
npm run type:check:client
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add shared/types/permission.types.ts client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx server/modules/assessment-dashboard test/unit/dashboard-permissions.spec.ts
git commit -m "fix: protect dashboard data by permission and scope"
```

### Task 2: Scope Employee List, Detail, and Binding History

**Files:**
- Modify: `server/modules/employee-management/employee-management.controller.ts`
- Modify: `server/modules/employee-management/employee-management.service.ts`
- Modify: `server/modules/employee-management/employee-management.module.ts`
- Test: `test/unit/employee-management-scope.spec.ts`

**Interfaces:**
- Consumes: `AccessScopeService.buildEmployeeScopeCondition(userId, { includeSelf: true })`
- Consumes: `AccessScopeService.canAccessEmployee(userId, employeeId, { includeSelf: true })`
- Produces: `list(query, userId)`, `detail(id, userId)`, and `bindingHistory(employeeId, userId)`

- [ ] **Step 1: Write failing service behavior tests**

Create a Nest testing module with mocked database chains, `EmployeeBindingService`, `RoleManagerService`, and `AccessScopeService`. Verify:

```ts
it('adds the current user scope condition to employee list queries', async () => {
  accessScope.buildEmployeeScopeCondition.mockResolvedValue(scopeSql);
  await service.list({ page: 1, pageSize: 20 }, 'manager-1');
  expect(accessScope.buildEmployeeScopeCondition).toHaveBeenCalledWith(
    'manager-1',
    { includeSelf: true },
  );
});

it('rejects employee detail outside the current user scope', async () => {
  accessScope.canAccessEmployee.mockResolvedValue(false);
  await expect(service.detail('employee-2', 'manager-1')).rejects.toThrow(
    '无权查看该员工',
  );
});

it('rejects binding history outside the current user scope', async () => {
  accessScope.canAccessEmployee.mockResolvedValue(false);
  await expect(
    service.bindingHistory('employee-2', 'manager-1'),
  ).rejects.toThrow('无权查看该员工');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/employee-management-scope.spec.ts`

Expected: FAIL because the service methods do not accept `userId` and do not use `AccessScopeService`.

- [ ] **Step 3: Inject and apply `AccessScopeService`**

Import `AccessScopeModule` in `EmployeeManagementModule`. Inject
`AccessScopeService` into `EmployeeManagementService`. Add the generated SQL
condition to employee collection queries. For detail and binding history, call
`canAccessEmployee` before querying protected data and throw
`ForbiddenException('无权查看该员工')` when denied.

- [ ] **Step 4: Pass the request user through the controller**

Add `@Req()` to list, detail, and binding-history handlers and pass
`req.userContext.userId` to the service.

- [ ] **Step 5: Run focused and related scope tests**

Run:

```bash
npm test -- --runInBand test/unit/employee-management-scope.spec.ts test/unit/access-scope.spec.ts
npm run type:check:server
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/modules/employee-management test/unit/employee-management-scope.spec.ts
git commit -m "fix: enforce employee data scope"
```

### Task 3: Require Statistics Export Permission for PDF Data

**Files:**
- Modify: `server/modules/assessment-operation/assessment-operation.controller.ts`
- Modify: `client/src/api/assessment-operation.ts`
- Modify: `client/src/pages/Statistics/StatisticsPage.tsx`
- Test: `test/unit/statistics-pdf-export-permission.spec.ts`

**Interfaces:**
- Produces: `GET /api/assessment-instances/:id/export-detail`
- Produces: client `exportDetail(id): Promise<AssessmentInstanceDetail>`

- [ ] **Step 1: Write the failing controller metadata test**

```ts
import 'reflect-metadata';
import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { AssessmentOperationController } from '../../server/modules/assessment-operation/assessment-operation.controller';

describe('statistics PDF export permission', () => {
  it('requires statistics export permission for export detail', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      AssessmentOperationController.prototype.exportDetail,
    );
    expect(metadata).toEqual({ resource: 'statistics', action: 'export' });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/statistics-pdf-export-permission.spec.ts`

Expected: FAIL because `exportDetail` does not exist.

- [ ] **Step 3: Add the protected export-detail endpoint**

Add an endpoint before the generic `GET :id` route:

```ts
@RequirePermission('statistics', 'export')
@NeedLogin()
@Get(':id/export-detail')
async exportDetail(@Req() req: Request, @Param('id') id: string) {
  const { userId } = req.userContext as { userId: string };
  return this.service.detail(id, userId);
}
```

Do not add a fixed `@CanRole`; dynamic permission is the capability boundary,
while `AssessmentOperationService.detail` retains object-scope enforcement.

- [ ] **Step 4: Switch the PDF flow to the protected endpoint**

Add `exportDetail` to the client API and call it from `handleExportPdf`. Wrap
the row-level export action in `CanDo resource="statistics" action="export"`.

- [ ] **Step 5: Run focused tests and type checks**

Run:

```bash
npm test -- --runInBand test/unit/statistics-pdf-export-permission.spec.ts
npm run type:check:server
npm run type:check:client
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/modules/assessment-operation/assessment-operation.controller.ts client/src/api/assessment-operation.ts client/src/pages/Statistics/StatisticsPage.tsx test/unit/statistics-pdf-export-permission.spec.ts
git commit -m "fix: protect statistics PDF exports"
```

### Task 4: Require Published-Assessment Export Permission

**Files:**
- Modify: `shared/types/permission.types.ts`
- Modify: `shared/types/assessment.types.ts`
- Modify: `client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx`
- Modify: `server/modules/assessment-publish/assessment-publish.controller.ts`
- Modify: `server/modules/assessment-publish/assessment-publish.service.ts`
- Modify: `client/src/api/assessment-publish.ts`
- Modify: `client/src/pages/PublishManagement/PublishManagementPage.tsx`
- Modify: `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
- Test: `test/unit/publish-export-permission.spec.ts`

**Interfaces:**
- Produces: `PublishExportRequest { instanceIds: string[] }`
- Produces: `POST /api/assessment-instances/export`
- Produces: client `exportInstances(instanceIds): Promise<AssessmentInstanceItem[]>`

- [ ] **Step 1: Write failing permission and input tests**

```ts
import 'reflect-metadata';
import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { AssessmentPublishController } from '../../server/modules/assessment-publish/assessment-publish.controller';

describe('published assessment export permission', () => {
  it('requires publish management export permission', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      AssessmentPublishController.prototype.exportInstances,
    );
    expect(metadata).toEqual({
      resource: 'publish_management',
      action: 'export',
    });
  });
});
```

Add a service test proving an empty ID list returns an empty result and that
the access-scope condition is included when IDs are supplied.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --runInBand test/unit/publish-export-permission.spec.ts`

Expected: FAIL because the permission action and export endpoint do not exist.

- [ ] **Step 3: Extend the permission matrix and API types**

Add `export` to `publish_management` valid actions and to the admin, HRD, and
department-head defaults. Do not grant it to supervisors by default.

Add:

```ts
export interface PublishExportRequest {
  instanceIds: string[];
}
```

- [ ] **Step 4: Add the protected scoped export endpoint**

Add `POST /api/assessment-instances/export` with
`@RequirePermission('publish_management', 'export')` and `@NeedLogin()`.
Validate a maximum of 1,000 unique IDs. Query only IDs matching the current
user's `AccessScopeService` condition and return `AssessmentInstanceItem[]`.

```ts
const instanceIds = Array.from(new Set(body.instanceIds || []));
if (instanceIds.length > 1000) {
  throw new BadRequestException('单次最多导出 1000 条绩效记录');
}
if (instanceIds.length === 0) return { items: [] };
```

- [ ] **Step 5: Route client export through the endpoint**

Call `exportInstances([...selectedInstanceIds])`, generate the workbook from the
returned rows, and wrap selection checkboxes plus the export command in
`CanDo resource="publish_management" action="export"`. Batch return and batch
unlock remain governed by `publish_management:edit`.

- [ ] **Step 6: Run focused tests and full Phase 1 verification**

Run:

```bash
npm test -- --runInBand test/unit/publish-export-permission.spec.ts
npm test -- --runInBand
npm run type:check
npm run lint
git diff --check
```

Expected: all commands exit 0 and Jest reports zero failing tests.

- [ ] **Step 7: Commit**

```bash
git add shared/types/permission.types.ts shared/types/assessment.types.ts client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx server/modules/assessment-publish client/src/api/assessment-publish.ts client/src/pages/PublishManagement/PublishManagementPage.tsx client/src/pages/PublishManagement/PublishedAssessmentSection.tsx test/unit/publish-export-permission.spec.ts
git commit -m "fix: protect published assessment exports"
```

### Task 5: Phase 1 Review Gate

**Files:**
- Review: all files changed by Tasks 1-4

**Interfaces:**
- Consumes: completed Phase 1 implementation
- Produces: review findings or approval to begin Phase 2

- [ ] **Step 1: Review the complete Phase 1 diff**

Run:

```bash
git diff 0523e57..HEAD --stat
git diff 0523e57..HEAD -- server shared client test
```

Confirm no unrelated user changes are included.

- [ ] **Step 2: Verify acceptance criteria**

Confirm:

- Dashboard requires `dashboard:view`.
- Department heads no longer receive global Dashboard statistics.
- Employee list, detail, and binding history enforce managed scope.
- PDF export requires `statistics:export`.
- Published-list export requires `publish_management:export`.
- Both export endpoints enforce object or collection data scope.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` against base `0523e57` and the current
HEAD. Fix every Critical or Important finding before Phase 2.

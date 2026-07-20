# Employee List Pagination Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver resilient, URL-driven, configurable server pagination for the employee management list.

**Architecture:** Add shared pure pagination helpers used by both React and NestJS so validation rules cannot drift. Extend the existing URL filter hook with `pageSize`, keep the employee data hook responsible for requests and out-of-range correction, and keep rendering concerns in `EmployeeListTab`.

**Tech Stack:** React 19, TypeScript, React Router 6, shadcn/ui, NestJS 10, Jest, Drizzle ORM.

## Global Constraints

- Supported employee page sizes are exactly 10, 20, 50, and 100.
- Default page size is 20.
- Filters and page-size changes reset the current page to 1.
- Existing server-side `limit`, `offset`, and `count` behavior remains in place.
- Do not introduce a new state-management or data-fetching library.
- Do not change pagination behavior outside employee management.

---

### Task 1: Shared Pagination Rules

**Files:**

- Create: `shared/employee-pagination.ts`
- Create: `test/unit/employee-pagination.spec.ts`

**Interfaces:**

- Produces: `EMPLOYEE_PAGE_SIZES`, `DEFAULT_EMPLOYEE_PAGE_SIZE`, `normalizeEmployeePage`, `normalizeEmployeePageSize`, `getEmployeeTotalPages`, and `getEmployeeVisiblePages`.

- [ ] **Step 1: Write failing tests**

Cover invalid, fractional, negative, unsupported, and valid inputs. Verify total pages never falls below 1 and visible pages stay within bounds with at most five entries.

- [ ] **Step 2: Verify RED**

Run: `npx jest test/unit/employee-pagination.spec.ts --runInBand`

Expected: FAIL because `@shared/employee-pagination` does not exist.

- [ ] **Step 3: Implement the shared helpers**

Use numeric conversion plus integer checks. Return page 1 and page size 20 for invalid input. Calculate visible page numbers around the current page.

- [ ] **Step 4: Verify GREEN**

Run: `npx jest test/unit/employee-pagination.spec.ts --runInBand`

Expected: PASS.

### Task 2: URL State and Employee Request Behavior

**Files:**

- Modify: `client/src/pages/EmployeeManagement/hooks/useEmployeeFilters.ts`
- Modify: `client/src/pages/EmployeeManagement/hooks/useEmployeeList.ts`
- Create: `test/unit/employee-pagination-integration.spec.ts`

**Interfaces:**

- Consumes: shared pagination helpers from Task 1.
- Produces: `EmployeeFilters.pageSize`, `EmployeeFiltersSetters.setPageSize`, and `UseEmployeeListOptions.onPageOutOfRange`.

- [ ] **Step 1: Write failing integration tests**

Check that the filter hook source uses shared normalizers, exposes page-size state, resets page for non-page parameters, and that the list hook sends dynamic `pageSize`, includes `binding` in callback dependencies, and invokes out-of-range correction.

- [ ] **Step 2: Verify RED**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: FAIL on missing `pageSize` and correction behavior.

- [ ] **Step 3: Implement URL and request changes**

Parse `page` and `pageSize` through shared helpers. Pass `filters.pageSize` to the API. On a successful response, calculate the last valid page; when the requested page is too high, call `onPageOutOfRange(lastPage)` and do not publish the stale empty page.

- [ ] **Step 4: Verify GREEN**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: PASS.

### Task 3: Pagination Controls

**Files:**

- Modify: `client/src/pages/EmployeeManagement/EmployeeListTab.tsx`
- Modify: `test/unit/employee-pagination-integration.spec.ts`

**Interfaces:**

- Consumes: `filters.pageSize`, `setPageSize`, shared total/visible page helpers, and the out-of-range callback accepted by `useEmployeeList`.

- [ ] **Step 1: Extend failing tests**

Check that the page renders a page-size selector, total/page summary, shared visible-page calculation, and boundary-disabled previous/next links.

- [ ] **Step 2: Verify RED**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: FAIL because the controls are absent.

- [ ] **Step 3: Implement the controls**

Render summary and page-size selection on every result state. Render navigation only when more than one page exists. Use `aria-disabled`, block clicks at boundaries, and apply disabled pointer/opacity styles.

- [ ] **Step 4: Verify GREEN**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: PASS.

### Task 4: Backend Parameter Normalization

**Files:**

- Modify: `server/modules/employee-management/employee-management.controller.ts`
- Modify: `test/unit/employee-pagination-integration.spec.ts`

**Interfaces:**

- Consumes: `normalizeEmployeePage` and `normalizeEmployeePageSize`.
- Produces: normalized positive `page` and supported `pageSize` values passed to `EmployeeManagementService.list`.

- [ ] **Step 1: Extend failing tests**

Instantiate the controller with a mocked service and verify invalid values become page 1/page size 20 while valid values are preserved.

- [ ] **Step 2: Verify RED**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: FAIL because the controller currently permits negative pages and arbitrary page sizes up to 100.

- [ ] **Step 3: Use shared normalizers in the controller**

Replace direct `parseInt`/`Math.min` logic with the shared helper calls.

- [ ] **Step 4: Verify GREEN**

Run: `npx jest test/unit/employee-pagination-integration.spec.ts --runInBand`

Expected: PASS.

### Task 5: Regression Verification

**Files:**

- Modify only if verification identifies a pagination-related issue.

**Interfaces:**

- Consumes all completed pagination behavior.
- Produces a type-safe, tested employee pagination flow.

- [ ] **Step 1: Run focused tests**

Run: `npx jest test/unit/employee-pagination.spec.ts test/unit/employee-pagination-integration.spec.ts test/unit/employee-management-scope.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 2: Run type checks**

Run: `npm run type:check`

Expected: both client and server checks exit successfully.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit successfully with no new pagination-related findings.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and review `git diff --stat`.

Expected: no whitespace errors and only pagination-related tracked files changed.

# Published Assessment Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the published-assessment status filter with the employee-processing, supervisor-processing, and completed task stages.

**Architecture:** The client sends business-stage filter values. The assessment-publish service owns a small pure mapping function that expands business stages into persisted workflow statuses and builds an `eq` or `or` query condition while preserving exact-status compatibility.

**Tech Stack:** React 19, TypeScript, NestJS 10, Drizzle ORM, Jest

## Global Constraints

- Do not change the persisted assessment workflow states.
- Preserve exact-status API filtering for existing callers.
- Keep legacy `pending_sign` and `supervisor_sign` records discoverable through grouped filters.
- Remove `draft` from the published-assessment filter.

---

### Task 1: Add grouped status mapping

**Files:**
- Modify: `server/modules/assessment-publish/assessment-publish.service.ts`
- Test: `test/unit/assessment-publish.status-filter.spec.ts`

**Interfaces:**
- Produces: `getPublishedAssessmentStatuses(status: string): string[]`
- Consumes: the `status` query parameter passed to `listInstances`

- [x] **Step 1: Write the failing mapping tests**

```ts
expect(getPublishedAssessmentStatuses('employee_processing')).toEqual([
  'self_review',
  'pending_sign',
]);
expect(getPublishedAssessmentStatuses('supervisor_processing')).toEqual([
  'supervisor_review',
  'supervisor_sign',
]);
expect(getPublishedAssessmentStatuses('completed')).toEqual(['completed']);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx jest test/unit/assessment-publish.status-filter.spec.ts --runInBand`

Expected: FAIL because `getPublishedAssessmentStatuses` is not exported.

- [x] **Step 3: Implement the mapping and query condition**

Add a pure exported mapping function. In `listInstances`, map the filter value;
use `eq` for one status and `or(...statuses.map(...))` for grouped statuses.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npx jest test/unit/assessment-publish.status-filter.spec.ts --runInBand`

Expected: PASS.

### Task 2: Replace the published-assessment dropdown options

**Files:**
- Modify: `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`

**Interfaces:**
- Consumes: `employee_processing`, `supervisor_processing`, `completed`
- Produces: the selected value through `onStatusFilterChange`

- [x] **Step 1: Replace the option list**

Use exactly:

```tsx
<SelectItem value="employee_processing">员工处理中</SelectItem>
<SelectItem value="supervisor_processing">上级处理中</SelectItem>
<SelectItem value="completed">已完成</SelectItem>
```

- [x] **Step 2: Verify the removed options**

Run:
`rg -n "员工步骤中|上级步骤中|value=\"draft\"" client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`

Expected: no matches in the status filter.

### Task 3: Verify the change

**Files:**
- Verify: `server/modules/assessment-publish/assessment-publish.service.ts`
- Verify: `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
- Verify: `test/unit/assessment-publish.status-filter.spec.ts`

- [x] **Step 1: Run the focused test**

Run: `npx jest test/unit/assessment-publish.status-filter.spec.ts --runInBand`

Expected: PASS.

- [x] **Step 2: Run project type checks**

Run: `npm run type:check`

Expected: both server and client checks exit successfully.

- [x] **Step 3: Review the final diff**

Run: `git diff --check && git diff -- server/modules/assessment-publish/assessment-publish.service.ts client/src/pages/PublishManagement/PublishedAssessmentSection.tsx test/unit/assessment-publish.status-filter.spec.ts`

Expected: no whitespace errors and only the scoped status-filter changes.

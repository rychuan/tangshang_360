# Assessment Feishu Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify employees and supervisors with role-specific Feishu messages when assessments are published and when unfinished tasks are manually reminded across all filtered pages.

**Architecture:** Add pure notification helpers for status grouping, URL validation, message construction, and bounded execution. The publish service queries unfinished instances by business scope, exposes preview/send endpoints, and reuses the same message helpers for publish notifications. The client replaces row-selection notification with a dedicated preview-and-confirm workflow.

**Tech Stack:** React 19, TypeScript, NestJS 10, Drizzle ORM, Jest, shadcn/ui

## Global Constraints

- Completed assessment instances must never receive reminder messages.
- Employees and supervisors receive separate role-specific messages.
- Publishing assessments must not roll back when notification delivery fails.
- Existing row selection semantics remain current-page only.
- Detail URLs must be validated HTTP/HTTPS absolute URLs.

---

### Task 1: Notification domain helpers

**Files:**

- Create: `server/common/assessment/notification.ts`
- Test: `test/unit/assessment-notification.spec.ts`

**Interfaces:**

- `normalizeAppBaseUrl(value: string): string`
- `getAssessmentBusinessStatus(status: string): 'employee_processing' | 'supervisor_processing' | 'completed'`
- `buildAssessmentDetailUrl(baseUrl: string, instanceId: string, view: 'employee' | 'supervisor'): string`
- `buildPublishedNotificationMessages(input): NotificationMessage[]`
- `buildReminderNotificationMessages(input): NotificationMessage[]`

- [x] Write tests for status grouping, URL validation, detail links, employee copy, supervisor copy, missing supervisors, and completed reminders.
- [x] Run the focused tests and verify they fail.
- [x] Implement the minimal pure helpers.
- [x] Run the focused tests and verify they pass.

### Task 2: Shared API contracts and backend endpoints

**Files:**

- Modify: `shared/api.interface.ts`
- Modify: `server/modules/assessment-publish/assessment-publish.controller.ts`
- Modify: `server/modules/assessment-publish/assessment-publish.service.ts`
- Test: `test/unit/assessment-publish.notification.spec.ts`

**Interfaces:**

- `ReminderPreviewResponse`
- `UnfinishedReminderRequest`
- `UnfinishedReminderResponse`
- `PublishRequest.appBaseUrl`
- `previewUnfinishedReminders(period, department, userId)`
- `remindUnfinishedAssessments(body, userId)`

- [x] Write failing tests for status grouping and reminder recipient counting.
- [x] Add preview and send API contracts.
- [x] Query all scoped unfinished instances for the period and department.
- [x] Send role-specific messages with bounded concurrency.
- [x] Record one reminder audit entry per assessment instance.
- [x] Update publish notifications to send employee and supervisor messages with links.
- [x] Verify focused backend tests pass.
- [x] Review unfinished filtering, scope conditions, partial delivery counts, and audit payloads in the final diff.

### Task 3: Client API and application URL

**Files:**

- Modify: `client/src/api/assessment-publish.ts`
- Create: `client/src/utils/app-url.ts`
- Test: `test/unit/app-url.spec.ts`

**Interfaces:**

- `getAppBaseUrl(): string`
- `previewUnfinishedReminders(params)`
- `remindUnfinishedAssessments(data)`

- [x] Write a failing test for base path normalization.
- [x] Implement the URL helper and API functions.
- [x] Include `appBaseUrl` in publish requests.
- [x] Verify the focused test passes.

### Task 4: Dedicated reminder confirmation UI

**Files:**

- Create: `client/src/pages/PublishManagement/UnfinishedReminderDialog.tsx`
- Modify: `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
- Modify: `client/src/pages/PublishManagement/PublishManagementPage.tsx`

**Interfaces:**

- Button callback: `onRemindUnfinished`
- Dialog input: `ReminderPreviewResponse | null`
- Dialog actions: cancel and confirm

- [x] Remove the selected-row batch notification button and props.
- [x] Add the permission-protected “通知未完成任务” button beside the section heading.
- [x] Load preview before opening the dialog.
- [x] Display task, employee, supervisor, and expected message counts.
- [x] Submit the filter-based reminder request.
- [x] Show success, warning, or error feedback based on message counts.
- [x] Clear stale row selection after sending.

### Task 5: Verification

**Files:**

- Verify all files above.

- [x] Run focused notification tests.
- [x] Run `npm test -- --runInBand`.
- [x] Run `npm run type:check`.
- [x] Run `git diff --check`.
- [x] Review the final diff for unrelated changes and verify the earlier grouped status filter remains intact.

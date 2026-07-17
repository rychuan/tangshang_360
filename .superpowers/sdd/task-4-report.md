# Task 4 Report

## RED
- Added `test/unit/frontend-capability-role-consistency.spec.ts`.
- First run failed on a Node import shape issue.
- After fixing imports, the inventory test failed with these violations:
  - `client/src/pages/GradeConfig/GradeConfigPage.tsx`
  - `client/src/pages/PublishManagement/PendingPublishSection.tsx`
  - `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
  - `client/src/pages/Statistics/StatisticsPage.tsx`
  - `client/src/pages/TeamPerformance/TeamPerformancePage.tsx`
  - `client/src/pages/TemplateManagement/TemplateManagementPage.tsx`

## GREEN
- Removed `CanRole` from the 5 business pages above.
- Kept the 3 permission admin components unchanged:
  - `client/src/pages/EmployeeManagement/RoleListPanel.tsx`
  - `client/src/pages/EmployeeManagement/RoleMembersTab.tsx`
  - `client/src/pages/EmployeeManagement/PermissionMatrixTab.tsx`
- Kept ordinary controls on `CanDo` only.
- Added `CanDo resource="statistics" action="export"` to statistics sync/export controls.

## Files
- `test/unit/frontend-capability-role-consistency.spec.ts`
- `client/src/pages/TemplateManagement/TemplateManagementPage.tsx`
- `client/src/pages/PublishManagement/PendingPublishSection.tsx`
- `client/src/pages/PublishManagement/PublishedAssessmentSection.tsx`
- `client/src/pages/Statistics/StatisticsPage.tsx`
- `client/src/pages/TeamPerformance/TeamPerformancePage.tsx`
- `client/src/pages/GradeConfig/GradeConfigPage.tsx`

## Self-review
- Inventory test now passes and covers all client `.ts` / `.tsx` files except the 3 admin-role panels.
- `npm run type:check:client` passes.
- Git commit is blocked by `.git/worktrees/.../index.lock` permission failure, so the worktree is left dirty by design.

## SHA
- `a2343639e292b5fd158acd5875a9e44d25686d21`

## Follow-up
- Added `test/unit/template-management-permission-boundary.spec.ts` to cover the view-only boundary.
- `TemplateManagementPage.tsx` now computes `canEdit` with `usePermission('template_management', 'edit')` and passes it to `TemplateFormDialog`.
- `TemplateFormDialog.tsx` now starts in preview-only mode for view-only users and hides edit/save controls unless `canEdit` is true.

## Command Results
- `npm test -- --runInBand test/unit/template-management-permission-boundary.spec.ts` PASS
- `npm run type:check:client` PASS
- `git add -A && git commit -m "fix: tighten template view-only editing"` PASS

## New SHA
- `624fe21`

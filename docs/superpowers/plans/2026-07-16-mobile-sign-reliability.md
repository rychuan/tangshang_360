# Mobile Sign Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace process-local mobile-sign tokens with durable database sessions and make signing, permissions, UI polling, and delivery feedback consistent.

**Architecture:** Add an `assessment_sign_session` table keyed by a SHA-256 token digest. Keep token/session lookup in `SignTokenService`, but execute the final session lock, instance lock, permission recheck, signature write, audit insert, and session success update in one `AssessmentOperationService` transaction. Frontend polling consumes explicit session states and keeps the detail page mounted while ratings transition into signing.

**Tech Stack:** NestJS 10, Drizzle ORM, PostgreSQL, React 19, TypeScript, Jest.

## Global Constraints

- Preserve the workflow `self_review -> pending_sign -> supervisor_review -> supervisor_sign -> completed`.
- Store only token hashes, never plaintext tokens.
- Use the authenticated user name for every signature.
- Require PNG/JPEG data URLs with at most 1 MiB decoded content.
- Do not modify unrelated `.omo` files.

---

### Task 1: Session Schema And Validation Utilities

**Files:**
- Create: `server/database/migrations/014_assessment_sign_session.sql`
- Modify: `server/database/schema.ts`
- Create: `server/modules/assessment-operation/sign-session.utils.ts`
- Create: `test/unit/sign-session.utils.spec.ts`
- Modify: `shared/types/assessment.types.ts`

**Interfaces:**
- Produces: `hashSignToken(token: string): string`
- Produces: `validateSignImage(signImage: string | undefined): string`
- Produces: `SignSessionStatus = 'pending' | 'succeeded' | 'failed' | 'expired' | 'invalid' | 'forbidden'`

- [x] Write failing tests proving token hashing is deterministic and non-plaintext.
- [x] Write failing tests rejecting missing, malformed, non-image, and decoded images larger than 1 MiB.
- [x] Run `npm test -- --runInBand test/unit/sign-session.utils.spec.ts` and confirm failures are caused by missing utilities.
- [x] Add the migration, Drizzle table, shared response types, and minimal utilities.
- [x] Re-run the utility tests and confirm they pass.

### Task 2: Persistent Sign Session Service

**Files:**
- Modify: `server/modules/assessment-operation/sign-token.service.ts`
- Modify: `server/modules/assessment-operation/assessment-operation.module.ts`
- Create: `test/unit/sign-token.service.spec.ts`

**Interfaces:**
- Produces: `generateToken(payload): Promise<string>`
- Produces: `getSession(token): Promise<AssessmentSignSession | null>`
- Produces: `deleteSession(token): Promise<void>`
- Produces: `sendSignMessage(...): Promise<void>` that rejects on delivery failure.

- [x] Write failing service tests for database insertion with a hash, lookup by hash, deletion, and propagated delivery failure.
- [x] Run the service test and confirm expected failures.
- [x] Replace the in-memory `Map` with Drizzle-backed operations.
- [x] Re-run the service tests and confirm they pass.

### Task 3: Atomic Session Signing And Identity Enforcement

**Files:**
- Modify: `server/modules/assessment-operation/assessment-operation.service.ts`
- Modify: `test/unit/assessment-operation.validation.spec.ts`
- Create: `test/unit/sign-session-state.spec.ts`

**Interfaces:**
- Produces: `getSignSession(token, userId): Promise<SignSessionResponse>`
- Produces: `getSignStatus(token, userId): Promise<SignStatusResponse>`
- Produces: `signByToken(token, userId, userName, signImage): Promise<SignSubmissionResponse>`

- [x] Add failing tests for explicit invalid/expired/forbidden/pending/succeeded state classification.
- [x] Add failing tests proving authenticated names override client names and signature images are mandatory.
- [x] Run the focused tests and confirm the expected failures.
- [x] Implement session and instance state classification from database fields.
- [x] Implement the atomic transaction that locks the session and instance, rechecks permissions, writes the signature/audit record, and marks the session succeeded.
- [x] Update direct desktop signing paths to validate images and use authenticated names.
- [x] Re-run focused tests and confirm they pass.

### Task 4: Controller Contract And Delivery Result

**Files:**
- Modify: `server/modules/assessment-operation/assessment-operation.controller.ts`
- Modify: `server/common/assessment/notification.ts`
- Create: `test/unit/assessment-operation.sign-controller.spec.ts`

**Interfaces:**
- `GET sign-session` returns explicit session status.
- `GET sign-session/status` returns explicit session status and `signed`.
- `POST sign-session` never consumes a token before the database transaction.
- `POST :id/sign-token` waits for delivery and removes the session if delivery fails.

- [x] Write failing controller tests for no pre-consumption and delivery failure cleanup.
- [x] Run the controller test and confirm expected failures.
- [x] Update controller methods and normalize the supplied application URL.
- [x] Re-run controller tests and confirm they pass.

### Task 5: Frontend Session State And Polling Lifecycle

**Files:**
- Modify: `client/src/api/sign-token.ts`
- Modify: `client/src/pages/AssessmentDetail/SignDialog.tsx`
- Modify: `client/src/pages/AssessmentDetail/useAssessmentDetail.ts`
- Modify: `client/src/pages/MobileSign/MobileSignPage.tsx`
- Modify: `client/src/pages/AssessmentDetail/AssessmentDetailPage.tsx`

**Interfaces:**
- Polling handles `pending/succeeded/expired/failed/invalid/forbidden`.
- `submitRatingsForMobileSign` updates local detail status without setting page-level loading.
- Every close, restart, and unmount clears the owning interval.

- [x] Update API typing to consume explicit statuses.
- [x] Change rating submission to update local status instead of calling the loading refresh path.
- [x] Add interval ownership and cleanup for close, restart, completion, timeout, and unmount.
- [x] Make mobile page render the signing pad only for `pending`.
- [x] Clear mobile canvas state on resize.
- [x] Require edit permission for employee buttons.
- [x] Run client type checking and focused ESLint.

### Task 6: Regression Suite And Existing Test Repair

**Files:**
- Modify: `test/unit/assessment-publish.unlock.spec.ts`
- Modify as required: tests created in Tasks 1-4.

- [x] Fix unlock tests to import from `unlock.service.ts`.
- [x] Run all assessment operation, workflow, unlock, and sign-session unit tests.
- [x] Run `npm run type:check`.
- [x] Run focused ESLint for all changed TypeScript files.
- [x] Run `git diff --check`.
- [x] Review the final diff against every requirement in the design specification.

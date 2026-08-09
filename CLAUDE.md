# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

企业级绩效考评管理系统 (Enterprise Performance Assessment System) — supports monthly and probation-period assessments with template configuration, employee binding, publish workflow, self/supervisor scoring, and statistical analysis.

## Platform Context

This project runs on the **妙搭 (Spark/Miaoda)** platform (`@lark-apaas/*` ecosystem). Platform tooling (`@lark-apaas/fullstack-nestjs-core`, `@lark-apaas/client-toolkit`) provides auth, DB injection, RBAC, routing generation, and deployment. Do not circumvent platform conventions.

Platform build environment enforces: strict TypeScript, esbuild JSX parsing, complete import resolution. All imports must be resolvable at build time — components used in JSX must have corresponding import statements.

## Commands

```bash
# Development (auto-detects sandbox vs local)
npm run dev

# Build (full production build)
npm run build

# Build only client or server
npm run build:client
npm run build:server

# Type checking (both client + server in parallel)
npm run type:check

# Lint (ESLint + type-check + stylelint, serial)
npm run lint
npm run lint -- --files client/src/pages/Foo/Bar.tsx  # selective

# Format
npm run format

# Testing (Jest)
npm test
npm run test:watch

# Database schema generation from Postgres
npm run gen:db-schema
```

## Architecture

### Three-Layer Monorepo

```
├── shared/          # Shared TypeScript types — THE source of truth for API contracts
│   └── api.interface.ts   # All request/response types, enums, constants
├── server/          # NestJS 10 backend
│   ├── modules/     # Feature modules (controller + service + module per domain)
│   ├── database/    # Drizzle ORM schema (auto-generated from DB)
│   └── common/      # Exception filter, response codes, interfaces
└── client/          # React 19 frontend (Vite)
    └── src/
        ├── api/     # API client functions — one file per backend module
        ├── pages/   # Page components — one directory per route
        ├── components/
        │   ├── ui/             # shadcn/ui primitives (Radix-based)
        │   └── business-ui/   # Domain-specific components
        └── hooks/   # Shared client hooks
```

### Backend Pattern (NestJS Module)

Each feature module follows a strict three-file pattern:

- **`*.module.ts`** — NestJS module registration
- **`*.controller.ts`** — Routes with `@CanRole([...])` guards, delegates to service
- **`*.service.ts`** — Business logic, injects `DRIZZLE_DATABASE` for DB access

Controllers use `@CanRole(['admin', 'hrd', ...])` for role-based access. The `@NeedLogin()` decorator is implicit when `@CanRole` is present.

### Frontend Pattern (React)

- **`client/src/api/*.ts`** — Typed API functions calling `axiosForBackend()` with shared types. API functions should check `res.status === 403` and throw a descriptive error for permission-denied cases.
- **`client/src/pages/*/`** — Each page is a self-contained directory (main page + sub-components + hooks + utils)
- **`client/src/components/ui/`** — shadcn/ui components (New York style, Lucide icons)
- **`client/src/components/business-ui/`** — Domain components: `PageHeader`, `PageTable`, `StatusBadge`, `GradeBadge`, `FilterBar`, `UserSelect`, `DepartmentSelect`, form components
- **`app.tsx`** — Route definitions with `ProtectedRoute` role gating
- **`index.tsx`** — Entry point: `BrowserRouter` → `AppContainer` → `ErrorBoundary` → `RoutesComponent`

#### Error Handling (CRITICAL)

All client-side API error handling MUST use `handleApiError(err)` from `@client/src/utils/api-error`. Do NOT manually check `err instanceof Error`:

```typescript
import { handleApiError } from '@client/src/utils/api-error';

try {
  await someApiCall();
} catch (err: unknown) {
  logger.error('Operation failed:', err);
  handleApiError(err); // 403 → toast "无权限", 401 → silent, other → server message or default
}
```

User notifications use `toast` from `sonner` (success/warning/error).

### Path Aliases

| Alias      | Resolves to   |
| ---------- | ------------- |
| `@/`       | `client/src/` |
| `@client/` | `client/`     |
| `@server/` | `server/`     |
| `@shared/` | `shared/`     |

### View Rendering

The `ViewModule` (registered last in `AppModule`) catches all `GET` routes and renders `dist/client/index.html` via Handlebars. Platform data is injected as `__platform__` JSON. This is a platform convention — do not remove the `ViewModule` or its `@route-order: last` placement.

## Database

PostgreSQL accessed through Drizzle ORM. The schema at `server/database/schema.ts` is **auto-generated** from the database via `npm run gen:db-schema`. Never edit it manually.

Key schema conventions:

- `employee.id` is a `user_profile` custom type (not UUID), with unique index on `((id).user_id)`
- `customTimestamptz` is used for all timestamp columns
- Audit trail via `audit_log` table

## Permission Model

Five built-in roles: `admin`, `hrd`, `dept_head`, `supervisor`, `employee`. Permission matrices are defined in `shared/types/permission.types.ts` (`DEFAULT_PERMISSIONS`). The `role-manager` module manages custom roles via the platform AuthorizationSDK.

### Permission Control (Single Layer with Identity Gate for Sensitive Ops)

**Standard pattern** — `@RequirePermission` on all endpoints:

```typescript
@RequirePermission('my_assessments', 'edit')  // permission gate
@NeedLogin()
@Post(':id/self-rating')
```

1. **`@RequirePermission(resource, action)`** — Primary permission gate. Validated by global `PermissionsGuard` via `RoleManagerService.checkUserPermission()` → AuthorizationSDK. Resources/actions defined in `shared/types/permission.types.ts`.
2. **`@NeedLogin()`** — Required on all endpoints that need user identity. Add explicitly even when guard would deny unauthenticated users.
3. **`@CanRole([...])`** — Platform role-level identity gate. **Only used in `role-manager.controller.ts`** for elevation-of-privilege operations (role CRUD, permission config changes). Do NOT add to general business endpoints; use `@RequirePermission` instead.

**Frontend permission control:**

- Route-level: `ProtectedRoute` with `resources` (checks view permission) + optional `identityRoles`
- Component-level: `usePermission(resource, action)` hook or `<CanDo resource={...} action={...}>` wrapper
- Navigation: `filterVisibleNavGroups()` filters sidebar items by permissions + identity roles

## Assessment Workflow State Machine

```
bound → published → self_review ──(with-sign)──▶ supervisor_review ──(with-sign)──▶ completed
                ▲              │                          │
                │              └─(rating only)──▶ pending_sign ──sign──┘
                │                                 supervisor_sign ◀──(rating only)──┘
                └──────────── 解锁/退回可回退到更早状态 ─────────────┘
```

- **bound**: Template bound to employee, employee-level indicator snapshots created
- **published**: Assessment published, instance-level indicator snapshots created from employee snapshots
- **self_review**: Self-rating phase — employee fills scores
- **pending_sign**: 仅分离流程进入 — 本人评分后待本人签名（CAS），签名后 → `supervisor_review`
- **supervisor_review**: Supervisor rating phase — supervisor/dept_head/admin fills scores（评分后 totalScore + grade 计算）
- **supervisor_sign**: 仅分离流程进入 — 上级评分后待上级签名（CAS），签名后 → `completed`
- **completed**: 终态

**两种提交模式**（控制器提供两套评分端点）：

1. **一步到位（`*-rating-with-sign`）**：评分与签名同时提交，跳过中间签名态 — `self_review → supervisor_review`、`supervisor_review → completed`。适用于网页端手写签名场景。
2. **分离流程（`*-rating` + 签名）**：先提交评分进入 `pending_sign` / `supervisor_sign`，再通过手机签名完成 — 生成签名 token（`POST :id/sign-token`）→ 飞书消息通知 → `GET sign-session` 查询 / `POST sign-session` 凭 token 签名（CAS：`WHERE signName IS NULL` 防覆盖）。`POST :id/sign` 为旧版单独签名入口，兼容历史 `pending_sign` / `supervisor_sign` 状态实例。

Key rules:

- Employee-level indicator snapshots are created on binding, adjusted before publish, then copied to instance-level snapshots on publish
- Rating writes must use `db.transaction()` + `SELECT ... FOR UPDATE` for concurrent safety (prevents double-submit race conditions)
- Unlock operations move status backward (logged in `audit_log`)
- Signing uses CAS pattern: `WHERE signName IS NULL` prevents overwriting an existing signature
- Non-draft submissions must include scores for ALL indicators; drafts skip completeness check

## Platform Tooling Notes

- **`@lark-apaas/fullstack-nestjs-core`** provides `PlatformModule.forRoot()`, `configureApp()`, `@CanRole`, `DRIZZLE_DATABASE` injection
- **`@lark-apaas/client-toolkit`** provides `AuthProvider`, `useAuth`, `useCurrentUserProfile`, `axiosForBackend`, `AppContainer`, `logger`
- **Vite config** is provided by `@lark-apaas/fullstack-vite-preset`; extend via `defineConfig()`, not from scratch
- **Tailwind** uses `createTailwindPresetOfSimple()` from `@lark-apaas/fullstack-presets`
- **Build** generates API routes and page routes automatically via `generate-api-routes` / `generate-page-routes`
- **`.spark_project`** defines platform commands (`run`, `build`, `test`, `gen:db-schema`) and file restrictions

## Database: Transaction Pattern for Concurrency

All write operations that modify multiple tables or involve conditional updates MUST use `db.transaction()` with `SELECT ... FOR UPDATE` to lock the target row:

```typescript
await this.db.transaction(async (tx) => {
  // Lock the row to prevent concurrent modifications
  const [row] = await tx.select().from(someTable)
    .where(eq(someTable.id, id))
    .for('update').limit(1);

  // Re-validate state inside transaction (prevents TOCTOU between pre-check and write)
  if (row.status !== expectedStatus) throw new BadRequestException('...');

  // Perform writes with tx (not db)
  await tx.update(...).set(...).where(...);
  await tx.insert(...).values(...);
});
```

Key points:

- Pre-validate outside transaction for fast-fail on obvious errors (invalid UUID, missing records, identity checks)
- Re-validate critical state (status, sign name) inside the transaction after acquiring the lock
- Use `inArray()` for batch queries instead of N+1 per-indicator SELECTs
- `DRIZZLE_DATABASE` is a standard `PostgresJsDatabase` — `db.transaction()` is fully supported

## Transaction Requirement (CRITICAL)

**ALL write operations that modify multiple tables MUST use `db.transaction()`.** This was audited and enforced across the entire codebase in a P0 fix session. No exceptions:

```typescript
// Pattern for deactivate/activate/delete/update + audit log:
await this.db.transaction(async (tx) => {
  await tx.update(...).set(...).where(...);
  await tx.insert(auditLog).values(...);
});
// Role sync / snapshot operations go OUTSIDE the transaction (external API calls)
```

## Employee Table: Logical Foreign Keys

`employee` table uses text fields + logical FK columns instead of DB-level FK constraints (because data comes from external sync):

| Field          | Type         | References                               | Notes                                     |
| -------------- | ------------ | ---------------------------------------- | ----------------------------------------- |
| `department`   | varchar      | legacy text                              | Display only, backward compat             |
| `departmentId` | uuid         | `department.id`                          | **Use this for queries**                  |
| `position`     | varchar      | legacy text                              | Display only                              |
| `positionCode` | varchar(100) | `system_dict.code` (dictType='position') | **Use this for queries**                  |
| `role`         | text         | comma-separated                          | `employee,supervisor,dept_head,hrd,admin` |

**Always resolve new columns on create/update** — if frontend only sends text values, backend must auto-resolve `departmentId` from `department.name` and `positionCode` from `system_dict.name`.

## Multi-Role Support

`employee.role` is now a comma-separated text field (e.g., `"employee,dept_head"`). Sync to AuthorizationSDK via `RoleManagerService.syncUserRoles()` on create/update. Frontend displays as multiple `Badge` components (split by comma). `employee` role is always required (checkbox disabled in form).

## Role Manager Service

Key methods in `server/modules/role-manager/role-manager.service.ts`:

- `ensureUserRole(userId, roleBizId)` — idempotent, adds user to role if not present
- `removeUserRole(userId, roleBizId)` — idempotent, removes user from role
- `syncUserRoles(userId, newRoles[])` — diffs current vs new, adds/removes as needed
- `addUserToEmployeeRole(userId)` — convenience for adding 'employee' role on creation

## Department Head Auto-Role

When department headId changes (create/update), `department.service.ts` automatically:

- Adds `dept_head` role to new head via `ensureUserRole(..., 'dept_head')`
- Removes `dept_head` from old head if they no longer head any department

## Frontend Table Conventions

All tables across the application follow these standards:

- **Left alignment**: All columns `text-left` except `totalScore` (financial convention: `text-right`)
- **Sticky action column**: `sticky right-0 bg-background z-20 border-l` (header) / `z-10` (cell) with `group-hover:bg-muted/50`
- **Badge action buttons**: Use `ActionBadge` component (`@/components/business-ui/action-badge`) — auto-maps actionType to variant
- **Crowded actions**: Use `DropdownMenu` with `MoreHorizontal` trigger to collapse 5+ buttons
- **Table rows must have `className="group"`** for sticky column hover to work

## UserDisplay Component

**CRITICAL platform requirement**: `UserDisplay` now requires `value={{ user_id, name }}` format. The old `userId={id}` prop is deprecated and shows "无效人员":

```tsx
// ✅ Correct
<UserDisplay value={{ user_id: id, name: name }} size="small" />
// ❌ Deprecated — shows "无效人员"
<UserDisplay userId={id} size="small" />
```

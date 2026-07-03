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
  handleApiError(err);  // 403 → toast "无权限", 401 → silent, other → server message or default
}
```

User notifications use `toast` from `sonner` (success/warning/error).

### Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/` | `client/src/` |
| `@client/` | `client/` |
| `@server/` | `server/` |
| `@shared/` | `shared/` |

### View Rendering

The `ViewModule` (registered last in `AppModule`) catches all `GET` routes and renders `dist/client/index.html` via Handlebars. Platform data is injected as `__platform__` JSON. This is a platform convention — do not remove the `ViewModule` or its `@route-order: last` placement.

## Database

PostgreSQL accessed through Drizzle ORM. The schema at `server/database/schema.ts` is **auto-generated** from the database via `npm run gen:db-schema`. Never edit it manually.

Key schema conventions:
- `employee.id` is a `user_profile` custom type (not UUID), with unique index on `((id).user_id)`
- `customTimestamptz` is used for all timestamp columns
- Audit trail via `audit_log` table

## Permission Model

Five built-in roles with `@CanRole` decorator: `admin`, `hrd`, `dept_head`, `supervisor`, `employee`. Permission matrices are defined in `shared/api.interface.ts` (`DEFAULT_PERMISSIONS`). The `role-manager` module manages custom roles via the platform AuthorizationSDK.

### Two-Layer Permission Control

Every endpoint should configure both layers:

```typescript
@CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])  // role gate
@RequirePermission('my_assessments', 'edit')                         // permission gate
@Post(':id/self-rating')
```

1. **`@CanRole([...])`** — Role-level guard. Must include ALL roles that need access; incomplete role list causes 403.
2. **`@RequirePermission(resource, action)`** — Fine-grained permission via AuthorizationSDK. Resources/actions defined in `shared/api.interface.ts`.
3. **`@NeedLogin()`** — Implicit when `@CanRole` is present; explicit otherwise.

## Assessment Workflow State Machine

```
bound → published → self_review → supervisor_review → pending_sign → completed
```

- **bound**: Template bound to employee, employee-level indicator snapshots created
- **published**: Assessment published, instance-level indicator snapshots created from employee snapshots
- **self_review**: Self-rating phase — employee fills scores, submits (status → `supervisor_review`)
- **supervisor_review**: Supervisor rating phase — supervisor/dept_head/admin fills scores, submits (status → `pending_sign`, totalScore + grade calculated)
- **pending_sign**: Signing phase — self and supervisor sign via CAS (both signed → `completed`)
- **completed**: Both signatures collected, final state

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

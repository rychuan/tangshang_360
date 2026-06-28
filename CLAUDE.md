# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

企业级绩效考评管理系统 (Enterprise Performance Assessment System) — supports monthly and probation-period assessments with template configuration, employee binding, publish workflow, self/supervisor scoring, and statistical analysis.

## Platform Context

This project runs on the **妙搭 (Spark/Miaoda)** platform (`@lark-apaas/*` ecosystem). Platform tooling (`@lark-apaas/fullstack-nestjs-core`, `@lark-apaas/client-toolkit`) provides auth, DB injection, RBAC, routing generation, and deployment. Do not circumvent platform conventions.

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

- **`client/src/api/*.ts`** — Typed API functions calling `axiosForBackend()` with shared types
- **`client/src/pages/*/`** — Each page is a self-contained directory (main page + sub-components + hooks + utils)
- **`client/src/components/ui/`** — shadcn/ui components (New York style, Lucide icons)
- **`app.tsx`** — Route definitions with `ProtectedRoute` role gating
- **`index.tsx`** — Entry point: `BrowserRouter` → `AppContainer` → `ErrorBoundary` → `RoutesComponent`

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

## Assessment Workflow State Machine

```
bound → published → self_review → supervisor_review → completed
```

- Employee-level indicator snapshots are created on binding, adjusted before publish, then copied to instance-level snapshots on publish
- Unlock operations move status backward (logged in `audit_log`)
- Signing (self/supervisor) captures name + signature image

## Platform Tooling Notes

- **`@lark-apaas/fullstack-nestjs-core`** provides `PlatformModule.forRoot()`, `configureApp()`, `@CanRole`, `DRIZZLE_DATABASE` injection
- **`@lark-apaas/client-toolkit`** provides `AuthProvider`, `useAuth`, `useCurrentUserProfile`, `axiosForBackend`, `AppContainer`
- **Vite config** is provided by `@lark-apaas/fullstack-vite-preset`; extend via `defineConfig()`, not from scratch
- **Tailwind** uses `createTailwindPresetOfSimple()` from `@lark-apaas/fullstack-presets`
- **Build** generates API routes and page routes automatically via `generate-api-routes` / `generate-page-routes`
- **`.spark_project`** defines platform commands (`run`, `build`, `test`, etc.)

# Shadcn-Compatible Dashboard Redesign

## Goal

Redesign the performance assessment application's global shell and dashboard to match the approved visual prototype while preserving the existing shadcn/ui component system, route permissions, API contracts, and business-page behavior.

The approved direction is a quiet, compact enterprise workspace:

- light gray application canvas;
- white main workspace;
- compact grouped sidebar;
- restrained top toolbar;
- high-information dashboard cards;
- readable 14px-oriented navigation and body typography;
- minimal shadows, subtle borders, and small corner radii.

## Scope

### Included

- Redesign `client/src/components/Layout.tsx`.
- Redesign `client/src/pages/HomePage/HomePage.tsx`.
- Add narrowly scoped presentation components when they make the dashboard easier to understand and maintain.
- Preserve responsive desktop and mobile navigation.
- Reuse the current dashboard APIs and role-aware navigation.
- Apply the new shell around all existing desktop business pages.

### Excluded

- Redesigning every table, dialog, form, and business component.
- Changing backend endpoints or database structures.
- Changing role or permission behavior.
- Replacing shadcn/ui base components.
- Adding a new global search backend.
- Implementing notification persistence or a notification center.

## Compatibility Strategy

The implementation will build on the project's existing shadcn/ui primitives:

- `SidebarProvider`, `Sidebar`, and related sidebar components;
- `Button`, `Card`, `Input`, `Badge`, `Avatar`, `Tooltip`, and `Sheet`;
- existing Tailwind utilities and semantic color tokens;
- `lucide-react` icons.

The redesign must not rewrite files under `client/src/components/ui/` unless a confirmed defect in an existing primitive blocks the work. Visual changes should be expressed through:

- composition and classes in `Layout.tsx`;
- page-scoped dashboard components;
- a small number of additional semantic shell tokens only if repeated styles cannot be expressed cleanly with existing tokens.

Global typography tokens in `client/src/tailwind-theme.css` will not be changed as part of this work. The approved type scale will be scoped to the redesigned shell and dashboard to avoid regressions in dense forms, dialogs, and tables.

## Global Shell

### Desktop Structure

The desktop application uses a two-column shell:

- sidebar width: approximately 220px;
- sidebar background: light neutral gray;
- main workspace background: white;
- outer application background: slightly darker neutral gray;
- content padding: 20px to 24px depending on viewport width.

The sidebar retains the existing permission-filtered navigation groups:

- 工作台;
- 绩效管理;
- 系统设置.

The sidebar header contains:

- application brand;
- current assessment-cycle label.

The cycle label shows the current month derived from the current date. It is not interactive and does not introduce a new filter contract.

The sidebar footer retains the current user identity and theme toggle. The approved "invite team members" treatment links to `/employees` when the current user has employee-management access and is hidden when the user lacks that permission.

### Top Toolbar

The top toolbar contains:

- current page title;
- a navigation command entry;
- theme toggle;
- current user avatar.

The command entry opens a local route-navigation menu built from the user's visible navigation items. It opens through click or `Cmd/Ctrl+K`, filters routes by label, and navigates to the selected route. It does not search employees or assessment records and its placeholder must describe route or function search accurately.

A notification button is not rendered in this iteration because the application has no notification data source.

### Existing Business Pages

All routed business pages continue rendering through `<Outlet />`. The shell will provide:

- consistent page padding;
- the neutral canvas;
- page transition styling;
- a stable content width;
- mobile overflow handling.

It will not add card containers around complete page sections and will not change the internal table or form hierarchy.

## Dashboard

### Header

The dashboard starts with:

- a time-appropriate greeting using the current user's display name;
- a short work-focused subtitle;
- a primary "发布考核" action only when the user can access publish management.

For users without publish permission, the action is omitted rather than disabled.

### Assessment Progress Feature

The blue feature panel communicates the current cycle:

- month and assessment type;
- overall progress;
- relevant deadline when available;
- completed and total participant counts;
- a context-sensitive primary action.

The current overview API does not guarantee all prototype fields. The component therefore follows these rules:

- use real API values when available;
- derive progress only when both numerator and denominator are trustworthy;
- omit unsupported deadline text rather than hardcode business data;
- fall back to a general "查看我的绩效" action for users without management access.

### Quick Actions

Quick actions come from `overview.shortcuts` and existing permission-aware routes. The dashboard provides icon and accent metadata locally by route.

Typical actions include:

- template management;
- publish management;
- statistics;
- employee management.

Only actions returned by the backend or confirmed accessible through current permissions are rendered.

### Pending Assessments

The existing `getTodos()` response remains the data source. Pending items render as compact rows or cards containing:

- assessment title;
- period;
- workflow type;
- status treatment;
- link to `/assessment/:id`.

The layout uses three columns on wide desktop, two columns on medium screens, and one column on mobile. It must remain readable with long Chinese names and assessment titles.

### Performance Summary

The existing `getOverview()` data continues to drive:

- pending count;
- completed count;
- average score;
- trend;
- grade distribution.

The first dashboard viewport prioritizes pending work and completion progress. Trend and grade-distribution visualizations remain available below the summary area rather than being removed.

Charts continue using the existing shadcn chart wrapper and Recharts. Empty datasets render explicit empty states.

## Typography And Visual Tokens

The approved prototype uses the following target scale:

- sidebar navigation and primary body text: approximately 14px;
- secondary metadata and table-support text: approximately 12px;
- section titles: approximately 14px to 16px;
- page title: approximately 28px to 34px;
- feature-panel title: approximately 26px to 28px.

Controls increase in height with the type scale:

- compact navigation rows: approximately 40px;
- toolbar controls: approximately 36px;
- primary buttons: approximately 36px to 38px.

Visual treatment:

- card radius no greater than 8px in production;
- borders define most surfaces;
- shadows are reserved for the application frame, overlays, and primary floating actions;
- blue is the main feature accent;
- orange, green, and purple identify distinct data categories without dominating the interface.

## Responsive Behavior

### Desktop

- Persistent sidebar.
- Dashboard uses two-column feature and quick-action composition.
- Pending work uses up to three columns.

### Tablet

- Sidebar remains available where space permits.
- Feature and quick-action panels stack.
- Pending work uses two columns.
- Tables retain horizontal scrolling inside their existing page boundaries.

### Mobile

- Sidebar uses the existing shadcn sheet behavior.
- Top toolbar reduces to the menu trigger, compact search or page title, and user affordance.
- Dashboard panels stack in one column.
- Primary actions remain reachable without overlapping titles.
- Fixed-format elements receive stable dimensions so labels and loading states do not shift layout.

## Data Flow

1. `Layout.tsx` obtains app information, user profile, auth ability, and permission resources exactly as it does today.
2. Visible navigation groups are derived from roles and permission resources.
3. `HomePage.tsx` loads todos and overview through React Query.
4. Dashboard presentation components receive normalized view models rather than calling APIs independently.
5. Routes and links remain the source of navigation behavior.

No new global state store is required.

## Loading And Error States

- The shell renders a stable skeleton while auth and permissions load.
- Dashboard loading preserves the final layout footprint where practical.
- A failed todos request does not erase valid overview data.
- A failed overview request does not erase valid todo data.
- Each failed dashboard section exposes a local retry action.
- Empty data is visually distinct from failed data.

This is a deliberate improvement over the current all-or-nothing dashboard error state.

## Component Boundaries

Expected focused components:

- `AppSidebar`: brand, cycle label, permission-aware navigation, footer;
- `AppTopbar`: page title, command entry, theme, user;
- `DashboardHero`: greeting and primary publish action;
- `AssessmentProgressPanel`: current-cycle progress;
- `DashboardQuickActions`: permission-aware shortcuts;
- `DashboardTodoGrid`: pending assessments;
- `DashboardSummary`: counts and compact metrics;
- existing chart sections retained or extracted only when extraction improves readability.

These components should remain close to their owning feature. Shared shell components belong under `client/src/components/`; dashboard-only components belong under `client/src/pages/HomePage/`.

## Testing

### Automated

- Permission-filtered navigation still hides inaccessible routes.
- Publish action is omitted without publish-management access.
- Quick actions render only accessible routes.
- Todo cards link to the correct assessment detail route.
- Partial dashboard API failures preserve successful sections.
- Loading, empty, and error states render independently.
- Greeting selection is deterministic for representative times.

### Verification

- Run client type checking.
- Run existing unit tests.
- Run lint for touched files or the project lint command.
- Verify desktop layout at approximately 1440x900.
- Verify tablet layout near 1024px width.
- Verify mobile layout near 390px width.
- Confirm no horizontal page overflow outside intentional table containers.
- Confirm the employee-management page remains usable inside the redesigned shell.
- Confirm light and dark themes remain readable.

## Acceptance Criteria

- The application shell visually matches the approved larger-type prototype.
- Existing shadcn/ui primitives remain the foundation.
- Existing role and permission behavior is unchanged.
- Existing business pages render correctly inside the new shell.
- The dashboard uses real API data and does not hardcode operational metrics.
- Dashboard sections handle loading, empty, partial-error, and success states.
- Desktop and mobile navigation remain usable.
- No backend or database change is required.

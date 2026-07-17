# Permission Enforcement Design

## Goal

Make the permission matrix accurately control resource pages, operations, APIs,
exports, and data scope across the performance assessment system.

## Authorization Model

Dynamic resource permissions determine what a user may do. Roles determine the
default permissions and the data scope within which an allowed action applies.

- `admin` and `hrd`: global data scope.
- `dept_head`: employees and assessments in departments managed by the user.
- `supervisor`: direct subordinates.
- `employee`: the current user's own records.
- Custom roles: permissions are honored; data scope defaults to self until a
  separate scope model is introduced.

`@RequirePermission(resource, action)` is the normal business capability
boundary. `@CanRole` remains only where an identity-level restriction is part of
the business rule, such as protecting role administration or the last
administrator.

## Permission Resources

The existing resources remain in use. The following changes are required:

- Add `dashboard` with the `view` action.
- Add `export` to `publish_management`.
- Keep `statistics:export` as the only permission for statistical file exports,
  including single-record PDF exports.
- Use `template_management:edit` for template deactivation.
- Use `team_performance:edit` for supervisor scoring performed from the team
  workflow.
- Use `employees:edit` for employee import/export synchronization.

## Backend Enforcement

Every business API must declare a resource permission unless it is an
authentication bootstrap endpoint, a token-scoped signing endpoint, a public
application view, or an intentionally shared reference-data endpoint.

The existing `AccessScopeService` becomes the common source for employee and
assessment data restrictions. Employee list, employee detail, binding history,
dashboard, statistics, publishing, and team performance must consistently apply
the current user's scope.

Export authorization must be checked before protected data is assembled.
Client-side file generation is allowed only after the server has returned data
through an endpoint protected by the corresponding export permission.

## Frontend Enforcement

`ProtectedRoute` checks both role-derived authentication state and the required
resource `view` permission. Hiding a navigation item is not considered route
protection.

Composite pages check each sub-resource independently:

- Employee list: `employees:view`.
- Department management: `organization:view`.
- Employee-template binding operations: `employee_binding:view/edit`.
- Bitable connection and synchronization operations: `employees:view/edit`.

Every command control uses the same resource/action pair as its API. Users
without an action do not see the command, and direct API calls remain protected
by the backend.

## Delivery Phases

### Phase 1: High-Risk Containment

- Protect Dashboard with `dashboard:view` and managed data scope.
- Protect statistical PDF and published-list exports.
- Apply employee data scope to list, detail, and binding history.

### Phase 2: Page and Command Consistency

- Add resource-aware route protection.
- Gate composite tabs independently.
- Gate department, dictionary, employee synchronization, publish batch, and
  other write controls with `CanDo`.

### Phase 3: Backend Capability Consistency

- Remove fixed role allowlists where they incorrectly override dynamic
  permissions.
- Retain explicit role restrictions only for identity-sensitive operations.
- Ensure custom-role permissions can reach the corresponding routes and APIs.

### Phase 4: Semantic Cleanup

- Align template deactivation, team scoring, export, binding, and synchronization
  action keys.
- Remove or migrate the legacy employee-level permission storage so it cannot
  disagree with role-based effective permissions.

## Error Handling

- Missing resource permission returns HTTP 403.
- An allowed action outside the user's data scope also returns HTTP 403 for
  object requests and an empty scoped result for collection requests.
- Frontend routes redirect to the existing 403 page.
- Mutation controls are hidden when permission data is loaded and the action is
  denied.
- Permission-loading failures fail closed.

## Testing

Each phase follows red-green-refactor.

- Unit tests cover permission/resource mappings and access-scope conditions.
- Controller/service tests cover denied actions and out-of-scope object access.
- Frontend tests cover direct URL access, composite tabs, and command visibility.
- Regression tests prove export data cannot be obtained without the matching
  export permission.
- Each phase must pass its focused tests, the complete Jest suite, server and
  client type checks, and lint before completion.

## Non-Goals

- A configurable custom-role data-scope editor.
- Replacing the platform authentication provider.
- Changing assessment workflow states.
- Refactoring unrelated employee, template, or publishing UI.

## Acceptance Criteria

- Permission-matrix changes have the same effect in navigation, routes, command
  controls, and APIs.
- Revoking `view` prevents direct page access.
- Revoking an action prevents both its UI command and direct API use.
- Department heads and supervisors cannot read employee or assessment data
  outside their managed scope.
- No export path works without its declared export permission.
- Custom-role permissions are not rejected solely because the role code is not
  one of the five built-in roles.

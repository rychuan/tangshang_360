# Authorization Consistency Repair Design

## Goal

Repair the authorization defects found after Phase 3 so that employee status,
role membership, dynamic permissions, and data scope cannot disagree in a way
that grants stale privileges or removes the final administrator.

The database becomes the durable source of desired authorization state.
AuthorizationSDK remains the external enforcement target, but an employee is
allowed to use role-derived capabilities only after the desired database state
has been synchronized successfully.

## Scope

This repair covers:

- built-in and custom role membership changes;
- employee create, update, activate, deactivate, delete, and import;
- final-administrator invariants and concurrent mutations;
- AuthorizationSDK partial failures and retry;
- permission-administration lockout prevention;
- role-cache invalidation;
- Dashboard and employee-management data-scope consistency.

It does not introduce a configurable data-scope model for custom roles. Custom
roles continue to use self scope.

## Authorization State

Add durable authorization state to the employee record:

- `authorizationRoles`: the complete desired SDK role list;
- `authorizationStatus`: `pending`, `synced`, or `failed`;
- `authorizationVersion`: monotonically increasing desired-state version;
- `authorizationError`: the latest synchronization error, when present;
- `authorizationUpdatedAt`: timestamp of the latest desired-state change.

Existing `employee.role` remains the primary built-in business role used by
employee-management screens and existing reports. It is not used by itself to
prove that SDK authorization is current.

The schema migration initially backfills a safe seed:

- `authorizationRoles` from the normalized comma-separated `employee.role`;
- `authorizationStatus = 'pending'`;
- `authorizationVersion = 1`;
- `authorizationError = null`.

Before the new fail-closed guard is enabled, a bootstrap command strictly reads
the complete SDK role set for every existing employee, persists built-in and
custom roles into `authorizationRoles`, and marks the row synced only after a
verification read matches. The deployment stops if any employee cannot be
bootstrapped. This prevents existing custom roles from being lost during
migration.

After rollout, custom roles discovered through role-management mutations are
persisted into `authorizationRoles`. Employee deactivation no longer depends on
audit logs as the only durable custom-role snapshot.

## Authorization State Machine

Every role-affecting mutation follows this state machine:

1. Acquire the shared authorization advisory lock when the mutation can affect
   administrator membership.
2. Re-read the target employee and administrator set inside the transaction.
3. Validate the final-administrator invariant against desired synchronized
   roles, not the stale `employee.role` value read before the transaction.
4. Persist the new desired role list, increment `authorizationVersion`, set
   `authorizationStatus = 'pending'`, and enqueue that version for sync.
5. Commit the business mutation, audit record, and sync job atomically.
6. Reconcile AuthorizationSDK to the exact effective role list.
7. On success, set `authorizationStatus = 'synced'` only when the employee
   version still matches the processed job.
8. On failure, set `authorizationStatus = 'failed'` only for the matching
   version and store the error.

The permission guard and `AccessScopeService` require all of the following:

- employee exists;
- employee is active;
- employee is not deleted;
- `authorizationStatus = 'synced'`.

Therefore an SDK failure fails closed even if the SDK still contains a stale
administrator role.

## SDK Reconciliation

Add an `authorization_sync_job` table with:

- employee ID;
- authorization version;
- `pending`, `processing`, `succeeded`, `failed`, or `superseded` status;
- attempt count and latest error;
- creation, start, and completion timestamps.

Only one worker may process an employee at a time. The worker claims a job with
row locking, re-reads the latest employee version before applying SDK changes,
and skips obsolete jobs. A newer mutation may make an in-flight job obsolete;
in that case its completion cannot mark the employee synced, and the newer job
reconciles the final state. The employee remains fail closed while any newer
version is pending.

`RoleManagerService` exposes one idempotent reconciliation operation:

```ts
reconcileUserRoles(userId, desiredRoles)
```

The operation:

- reads current SDK roles strictly;
- computes the effective desired roles as `authorizationRoles` for an active
  employee and an empty list for an inactive or deleted employee;
- removes roles not present in the effective desired set before adding new
  roles, so privilege reduction happens first;
- applies additions and removals idempotently;
- re-reads SDK roles after mutation;
- succeeds only when the final role set exactly matches the desired set;
- always invalidates the local role cache.

The database status remains `failed` if any SDK step or final verification
fails for the latest version. Repeating reconciliation is safe. API mutations
may process their newly created job synchronously for immediate feedback, but
they use the same durable job claim and version checks as background retries.

Add an administrator-only retry API for employees in `pending` or `failed`
state. The retry uses the database `authorizationRoles`; callers cannot submit
an arbitrary role list through this endpoint.

## Role Administration Boundaries

Built-in roles are identity-sensitive and cannot be mutated through generic SDK
role-member endpoints:

- `admin`, `hrd`, `dept_head`, `supervisor`, and `employee` membership changes
  must use employee or department lifecycle services;
- built-in roles cannot be deleted;
- generic add/remove member APIs accept custom roles only;
- custom-role user membership changes update the target employee's
  `authorizationRoles`, mark it pending, and use the common reconciler;
- department, group-chat, all-employee, and preset-group membership mutation is
  rejected for roles that contribute application permissions because the
  application cannot durably map those memberships to employee authorization
  state.

This intentionally narrows role assignment to explicit users. It removes the
30-second group-cache revocation window and gives every authorized user a
durable desired role set.

## Administrator Invariants

An effective administrator is an employee who is:

- active and not deleted;
- `authorizationStatus = 'synced'`;
- configured with `admin` in `authorizationRoles`.

All operations that remove effective administrator status use the same
PostgreSQL advisory lock and re-read both the target employee and current
administrator count after acquiring the lock.

The following are rejected:

- removing the final administrator role;
- deactivating or deleting the final administrator;
- changing the final administrator to a non-admin desired role list;
- changing the `admin` role permission configuration so it no longer includes
  `permission_management:view` and `permission_management:edit`;
- deleting any built-in role.

The generic role-member API cannot bypass these checks because it cannot mutate
built-in roles.

## Employee Lifecycle

### Create

Create accepts the final active status and desired role list in one operation.
Inactive imports create the employee directly as inactive with an empty
effective SDK role set; they are never temporarily authorized.

### Update

Role updates persist a new desired role list and trigger reconciliation. Profile
updates that do not affect roles do not change authorization state.

Inactive employee role updates change the saved desired role list but keep the
effective SDK role list empty. They are reconciled to the saved desired list
only during activation.

### Deactivate and Delete

The transaction preserves `authorizationRoles` for future restoration and sets
the employee inactive or deleted. The reconciler computes an empty effective
SDK role list for inactive or deleted employees and removes every SDK role.
Failed reconciliation leaves authorization status failed, so stale SDK roles
cannot produce backend capability.

### Activate

Activation is rejected or treated as an idempotent no-op when the employee is
already active. For an inactive employee it restores the current durable
`authorizationRoles`, not an unconditional historical audit snapshot.

Audit-log role snapshots remain historical evidence but are no longer the
source used for activation.

## Data-Scope Consistency

`AccessScopeService` returns self scope with no roles when authorization state
is not synced.

Dashboard todos use `AccessScopeService` rather than querying direct
subordinates independently. Dashboard todos and overview therefore share the
same role-derived scope.

Employee position options are filtered through the same employee scope as the
employee list.

Employee-management composite tabs use dynamic view permissions only:

- employee list: `employees:view`;
- departments: `organization:view`;
- Bitable: `employees:view`.

Backend data scope remains authoritative. A custom role with self scope may
reach a page but receives only self-scoped data or a resource-specific
forbidden response for global configuration objects.

## Permission Configuration Validation

Permission payloads are normalized and validated at runtime:

- only known resources and actions are accepted;
- non-view actions imply view;
- duplicate resource entries are merged;
- the `admin` role must retain permission-management view and edit;
- permission changes are audited.

Deleting a custom role calls the SDK first. Its local permission configuration
is removed only after SDK deletion succeeds, preventing a failed SDK deletion
from stripping permissions from a still-existing role.

## Error Handling

- Missing capability or unsynchronized authorization returns HTTP 403.
- Final-administrator violations return HTTP 400 with the existing
  administrator-preservation message.
- SDK synchronization failures return an error and leave durable
  `authorizationStatus = 'failed'`.
- Obsolete sync jobs are recorded as superseded and cannot change the current
  employee authorization status.
- Retry endpoints report the employee ID and final synchronization state
  without exposing SDK credentials or raw payloads.
- Import results report authorization failures per row and never count a row as
  created when its requested lifecycle state was not reached.

## Testing

Tests must be written before implementation and cover:

- direct removal of the final built-in administrator is rejected;
- built-in role deletion and generic built-in membership mutation are rejected;
- admin permission configuration cannot remove its own management capability;
- concurrent promotion, demotion, deactivation, and deletion re-read state
  under the shared advisory lock;
- SDK partial failure leaves database status failed and backend permissions
  denied;
- out-of-order jobs cannot mark an obsolete role set as synced;
- retry reconciles the exact desired role set and marks the employee synced;
- inactive import never creates a temporarily active authorization state;
- inactive role changes are restored correctly on activation;
- repeated activation does not restore stale roles;
- custom-role user mutation updates durable desired roles;
- group, department, all-employee, and preset-group mutations are rejected;
- Dashboard todos and overview use the same scope;
- employee position options respect employee scope;
- custom-role employee-management tabs are permission-first.

Verification requires focused tests, the complete Jest suite, server and client
type checks, lint, and `git diff --check`.

## Migration and Rollout

1. Apply the schema migration with authorization enforcement disabled.
2. Run the bootstrap command to import and verify complete SDK roles for every
   existing employee.
3. Stop rollout if any employee remains pending or failed.
4. Deploy the fail-closed guard, scope changes, lifecycle mutations, and sync
   worker.
5. Run a reconciliation scan for all active employees after deployment.
6. Review failed employees and retry after correcting SDK or data issues.

The deployment must not enable the new guard before every existing employee has
been bootstrapped successfully.

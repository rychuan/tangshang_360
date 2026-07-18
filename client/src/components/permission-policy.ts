import type {
  PermissionAction,
  PermissionItem,
  PermissionResource,
} from '@shared/api.interface';

export const COMMAND_PERMISSIONS = {
  departmentEdit: { resource: 'organization', action: 'edit' },
  departmentDelete: { resource: 'organization', action: 'delete' },
  dictionaryEdit: { resource: 'dictionary_config', action: 'edit' },
  employeeSync: { resource: 'employees', action: 'edit' },
  employeeSyncLog: { resource: 'employees', action: 'view' },
  employeeBindingEdit: { resource: 'employee_binding', action: 'edit' },
  employeeBindingView: { resource: 'employee_binding', action: 'view' },
  assessmentView: { resource: 'my_assessments', action: 'view' },
  assessmentEdit: { resource: 'my_assessments', action: 'edit' },
} as const satisfies Record<
  string,
  { resource: PermissionResource; action: PermissionAction }
>;

export function hasPermission(
  permissions: PermissionItem[],
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return permissions.some(
    (item) => item.resource === resource && item.actions.includes(action),
  );
}

export function hasAnyViewPermission(
  permissions: PermissionItem[],
  resources: PermissionResource[],
): boolean {
  return (
    resources.length > 0 &&
    resources.some((resource) => hasPermission(permissions, resource, 'view'))
  );
}

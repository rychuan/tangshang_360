import type {
  PermissionAction,
  PermissionItem,
  PermissionResource,
} from '@shared/api.interface';

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

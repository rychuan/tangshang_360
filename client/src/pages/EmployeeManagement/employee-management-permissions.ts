import type { PermissionItem } from '@shared/api.interface';
import { hasPermission } from '../../components/permission-policy';

export type EmployeeManagementTab = 'employees' | 'departments' | 'bitable';

const TAB_ORDER: EmployeeManagementTab[] = [
  'employees',
  'departments',
  'bitable',
];

export function getVisibleEmployeeManagementTabs(
  permissions: PermissionItem[],
  identityRoles: string[],
): EmployeeManagementTab[] {
  const visible = new Set<EmployeeManagementTab>();
  if (hasPermission(permissions, 'employees', 'view')) {
    visible.add('employees');
  }
  if (
    hasPermission(permissions, 'organization', 'view') &&
    identityRoles.some((role) =>
      ['admin', 'hrd', 'dept_head'].includes(role),
    )
  ) {
    visible.add('departments');
  }
  if (
    hasPermission(permissions, 'employees', 'view') &&
    identityRoles.some((role) => ['admin', 'hrd'].includes(role))
  ) {
    visible.add('bitable');
  }

  return TAB_ORDER.filter((tab) => visible.has(tab));
}

export function getDefaultEmployeeManagementTab(
  tabs: EmployeeManagementTab[],
): EmployeeManagementTab | null {
  return tabs[0] ?? null;
}

export function hasEmployeeRowMenuAction(
  permissions: PermissionItem[],
): boolean {
  if (hasPermission(permissions, 'employee_binding', 'view')) {
    return true;
  }

  const canManageBindings = hasPermission(
    permissions,
    'employee_binding',
    'edit',
  );
  const canManageEmployees =
    hasPermission(permissions, 'employees', 'edit') ||
    hasPermission(permissions, 'employees', 'delete');

  return canManageBindings || canManageEmployees;
}

export function getEmployeeListCapabilities(
  permissions: PermissionItem[],
): {
  loadTemplates: boolean;
  showBindings: boolean;
  showSelection: boolean;
  showActions: boolean;
} {
  const canManageBindings = hasPermission(
    permissions,
    'employee_binding',
    'edit',
  );

  return {
    loadTemplates: canManageBindings,
    showBindings: hasPermission(permissions, 'employee_binding', 'view'),
    showSelection: canManageBindings,
    showActions: hasEmployeeRowMenuAction(permissions),
  };
}

export function getDepartmentCommandCapabilities(
  permissions: PermissionItem[],
): {
  canEdit: boolean;
  canDelete: boolean;
} {
  return {
    canEdit: hasPermission(permissions, 'organization', 'edit'),
    canDelete: hasPermission(permissions, 'organization', 'delete'),
  };
}

export function canCreateDepartment(
  permissions: PermissionItem[],
  identityRoles: string[],
): boolean {
  return (
    hasPermission(permissions, 'organization', 'edit') &&
    identityRoles.some((role) => ['admin', 'hrd'].includes(role))
  );
}

export function canManageDepartmentHead(
  permissions: PermissionItem[],
  identityRoles: string[],
): boolean {
  return (
    identityRoles.includes('admin') &&
    hasPermission(permissions, 'permission_management', 'edit')
  );
}

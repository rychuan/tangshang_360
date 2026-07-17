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
  roles: string[],
): EmployeeManagementTab[] {
  const hasRole = (...allowed: string[]) =>
    allowed.some((role) => roles.includes(role));

  const visible = new Set<EmployeeManagementTab>();
  if (
    hasRole('admin', 'hrd', 'dept_head', 'supervisor') &&
    hasPermission(permissions, 'employees', 'view')
  ) {
    visible.add('employees');
  }
  if (
    hasRole('admin', 'hrd', 'dept_head') &&
    hasPermission(permissions, 'organization', 'view')
  ) {
    visible.add('departments');
  }
  if (
    hasRole('admin', 'hrd') &&
    hasPermission(permissions, 'employees', 'view')
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
  roles: string[],
): boolean {
  if (hasPermission(permissions, 'employee_binding', 'view')) {
    return true;
  }

  const canManageBindings =
    roles.some((role) => role === 'admin' || role === 'hrd') &&
    hasPermission(permissions, 'employee_binding', 'edit');
  const canManageEmployees =
    roles.includes('admin') &&
    (hasPermission(permissions, 'employees', 'edit') ||
      hasPermission(permissions, 'employees', 'delete'));

  return canManageBindings || canManageEmployees;
}

export function getEmployeeListCapabilities(
  permissions: PermissionItem[],
  roles: string[],
): {
  loadTemplates: boolean;
  showBindings: boolean;
  showSelection: boolean;
  showActions: boolean;
} {
  const canManageBindings =
    roles.some((role) => role === 'admin' || role === 'hrd') &&
    hasPermission(permissions, 'employee_binding', 'edit');

  return {
    loadTemplates: canManageBindings,
    showBindings: hasPermission(permissions, 'employee_binding', 'view'),
    showSelection: canManageBindings,
    showActions: hasEmployeeRowMenuAction(permissions, roles),
  };
}

export function getDepartmentCommandCapabilities(
  permissions: PermissionItem[],
  roles: string[],
): {
  canEdit: boolean;
  canDelete: boolean;
} {
  return {
    canEdit:
      roles.some(
        (role) => role === 'admin' || role === 'hrd' || role === 'dept_head',
      ) && hasPermission(permissions, 'organization', 'edit'),
    canDelete:
      roles.includes('admin') &&
      hasPermission(permissions, 'organization', 'delete'),
  };
}

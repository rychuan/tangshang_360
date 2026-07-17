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

import type { PermissionItem } from '@shared/api.interface';
import type { NavGroup, NavItem } from '../navigation';

export function filterVisibleNavGroups(args: {
  groups: NavGroup[];
  canRole: (role: string) => boolean;
  permissions: PermissionItem[];
}): NavGroup[] {
  return args.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const roleAllowed = item.roles.some(args.canRole);
        const permissionAllowed =
          !item.permissionResource ||
          args.permissions.some(
            (permission) =>
              permission.resource === item.permissionResource &&
              permission.actions.includes('view'),
          );
        return roleAllowed && permissionAllowed;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export function filterNavItems(items: NavItem[], query: string): NavItem[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return items;
  return items.filter((item) =>
    item.label.toLocaleLowerCase('zh-CN').includes(normalized),
  );
}

export function getCurrentNavLabel(
  pathname: string,
  groups: NavGroup[],
  breadcrumbLabel: string,
): string {
  if (breadcrumbLabel) return breadcrumbLabel;
  const items = flattenNavItems(groups);
  const exact = items.find((item) => item.path === pathname);
  if (exact) return exact.label;
  const parent = items.find(
    (item) => item.path !== '/' && pathname.startsWith(item.path),
  );
  if (parent) return parent.label;
  if (pathname.startsWith('/assessment/')) return '绩效详情';
  return '绩效考核';
}

export function formatCurrentCycle(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月考核周期`;
}

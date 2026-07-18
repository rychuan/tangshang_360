import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { getOverview, getTodos } from '@/api/dashboard';
import type { NavItem } from '@/components/navigation';

export interface SidebarBadges {
  [path: string]: { text: string; tone: 'muted' | 'warning' | 'destructive' | 'success' };
}

export function useSidebarBadges(items: NavItem[]): SidebarBadges {
  const { permissions } = usePermissions();

  const hasTodoAccess = items.some(
    (item) =>
      item.badgeResource &&
      permissions.some(
        (p) => p.resource === item.badgeResource && p.actions.includes('view'),
      ),
  );

  const todosQuery = useQuery({
    queryKey: ['dashboard', 'todos'],
    queryFn: getTodos,
    staleTime: 60_000,
    enabled: hasTodoAccess,
  });

  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: getOverview,
    staleTime: 60_000,
    enabled: hasTodoAccess,
  });

  if (!hasTodoAccess || !todosQuery.data || !overviewQuery.data) return {};

  const todos = todosQuery.data.items;
  const overview = overviewQuery.data.stats;

  const badges: SidebarBadges = {};

  for (const item of items) {
    if (!item.badgeResource) continue;

    if (item.badgeResource === 'my_assessments') {
      const count = todos.filter((t) => t.type === 'self_review').length;
      if (count > 0) {
        badges[item.path] = { text: String(count), tone: 'warning' };
      } else {
        badges[item.path] = { text: '✓', tone: 'success' };
      }
    }

    if (item.badgeResource === 'team_performance') {
      const count = todos.filter((t) => t.type === 'supervisor_review').length;
      if (count > 0) {
        badges[item.path] = { text: String(count), tone: 'warning' };
      } else {
        badges[item.path] = { text: '✓', tone: 'success' };
      }
    }

    if (item.badgeResource === 'publish_management') {
      const count = overview.pendingCount ?? 0;
      if (count > 0) {
        badges[item.path] = { text: String(count), tone: 'destructive' };
      } else {
        badges[item.path] = { text: '✓', tone: 'success' };
      }
    }
  }

  return badges;
}

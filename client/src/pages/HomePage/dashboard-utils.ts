import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileText,
  Send,
  Shield,
  UserCog,
  Users,
  type LucideIcon,
} from '@/components/ui/hugeicons';
import type {
  DashboardOverviewResponse,
  PermissionItem,
} from '@shared/api.interface';
import type { PermissionResource } from '@shared/api.interface';

export interface DashboardQuickAction {
  title: string;
  path: string;
  icon: LucideIcon;
  tone: 'blue' | 'orange' | 'purple' | 'green';
}

const QUICK_ACTION_META: Record<
  string,
  Pick<DashboardQuickAction, 'icon' | 'tone'>
> = {
  '/template-management': { icon: FileText, tone: 'blue' },
  '/publish-management': { icon: Send, tone: 'orange' },
  '/statistics': { icon: BarChart3, tone: 'purple' },
  '/employees': { icon: UserCog, tone: 'green' },
  '/my-assessments': { icon: ClipboardList, tone: 'blue' },
  '/permissions': { icon: Shield, tone: 'purple' },
  '/team-performance': { icon: Users, tone: 'green' },
  '/grade-config': { icon: Award, tone: 'orange' },
  '/dictionary': { icon: BookOpen, tone: 'blue' },
};

export function getGreeting(date: Date): '早上好' | '下午好' | '晚上好' {
  const hour = date.getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function buildProgress(stats: {
  completedCount: number;
  pendingCount: number;
}) {
  const total = stats.completedCount + stats.pendingCount;

  return {
    completed: stats.completedCount,
    pending: stats.pendingCount,
    total,
    percentage: total === 0 ? 0 : Math.round((stats.completedCount / total) * 100),
  };
}

export function buildQuickActions(
  shortcuts: DashboardOverviewResponse['shortcuts'],
  visiblePaths: Set<string>,
): DashboardQuickAction[] {
  const seen = new Set<string>();

  return shortcuts.flatMap((shortcut) => {
    if (
      shortcut.path === '/' ||
      seen.has(shortcut.path) ||
      !visiblePaths.has(shortcut.path) ||
      !QUICK_ACTION_META[shortcut.path]
    ) {
      return [];
    }

    seen.add(shortcut.path);
    return [{ ...shortcut, ...QUICK_ACTION_META[shortcut.path] }];
  });
}

export function mapGradeDistribution(
  distribution?: DashboardOverviewResponse['stats']['gradeDistribution'],
) {
  return Object.entries(distribution ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([grade, count]) => ({ grade, count }));
}

const PERMISSION_RESOURCE_PATHS: Partial<Record<PermissionResource, string[]>> =
  {
    dashboard: ['/dashboard'],
    my_assessments: ['/my-assessments'],
    employees: ['/employees'],
    template_management: ['/template-management'],
    publish_management: ['/publish-management'],
    statistics: ['/statistics'],
    team_performance: ['/team-performance'],
    permission_management: ['/permissions'],
    grade_config: ['/grade-config'],
    dictionary_config: ['/dictionary'],
  };

export function buildVisiblePaths(permissions: PermissionItem[]): Set<string> {
  return new Set(
    permissions
      .filter((permission) => permission.actions.includes('view'))
      .flatMap(
        (permission) => PERMISSION_RESOURCE_PATHS[permission.resource] ?? [],
      ),
  );
}

export type DashboardSectionStatus = 'loading' | 'error' | 'empty' | 'ready';

export function resolveSectionStatus(args: {
  hasData: boolean;
  loading: boolean;
  error: unknown;
}): DashboardSectionStatus {
  if (args.hasData) return 'ready';
  if (args.loading) return 'loading';
  if (args.error) return 'error';
  return 'empty';
}

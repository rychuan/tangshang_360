import React from 'react';
import { ROLE_SUBJECT, useAuth } from '@lark-apaas/client-toolkit/auth';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { getOverview, getTodos } from '@/api/dashboard';
import { queryKeys } from '@/api/queryKeys';
import { hasRoleAndPermissionAccess } from '@/components/app-shell/app-shell-utils';
import { PageHeader } from '@/components/business-ui/page-header';
import { ADMIN_HRD_ROLES } from '@/components/role-constants';
import { usePermissions } from '@/hooks/usePermissions';
import { AssessmentProgressPanel } from './AssessmentProgressPanel';
import { DashboardCharts } from './DashboardCharts';
import { DashboardHero } from './DashboardHero';
import { DashboardQuickActions } from './DashboardQuickActions';
import { DashboardSummary } from './DashboardSummary';
import { DashboardTodoGrid } from './DashboardTodoGrid';
import { buildQuickActions, buildVisiblePaths } from './dashboard-utils';

const HomePage: React.FC = () => {
  const userInfo = useCurrentUserProfile();
  const { ability } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const todosQuery = useQuery({
    queryKey: queryKeys.dashboard.todos(),
    queryFn: getTodos,
    select: (data) => data.items,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: getOverview,
  });

  const visiblePaths = buildVisiblePaths(permissions);
  const canPublish = hasRoleAndPermissionAccess({
    roles: ADMIN_HRD_ROLES,
    canRole: (role) => ability.can(role, ROLE_SUBJECT),
    permissions,
    resource: 'publish_management',
    action: 'publish',
  });
  const quickActions = buildQuickActions(
    overviewQuery.data?.shortcuts ?? [],
    visiblePaths,
  );
  const overviewState = {
    stats: overviewQuery.data?.stats,
    loading: overviewQuery.isLoading,
    error: overviewQuery.error,
    onRetry: () => overviewQuery.refetch(),
  };
  const todoState = {
    items: todosQuery.data ?? [],
    loading: todosQuery.isLoading,
    error: todosQuery.error,
    onRetry: () => todosQuery.refetch(),
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-5">
      <PageHeader title="绩效工作台" visuallyHidden />
      <DashboardHero userName={userInfo?.name} canPublish={canPublish} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(340px,.9fr)_minmax(520px,1.5fr)]">
        <AssessmentProgressPanel {...overviewState} />
        <DashboardQuickActions
          items={quickActions}
          loading={overviewQuery.isLoading || permissionsLoading}
          error={overviewQuery.error}
          onRetry={() => overviewQuery.refetch()}
        />
      </div>
      <DashboardTodoGrid {...todoState} />
      <DashboardSummary {...overviewState} />
      <DashboardCharts {...overviewState} />
    </div>
  );
};

export default HomePage;

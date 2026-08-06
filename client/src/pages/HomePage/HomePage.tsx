import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { getOverview } from '@/api/dashboard';
import { queryKeys } from '@/api/queryKeys';
import { hasPermissionAccess } from '@/components/app-shell/app-shell-utils';
import { PageHeader } from '@/components/business-ui/page-header';
import { usePermissions } from '@/hooks/usePermissions';
import { AssessmentProgressPanel } from './AssessmentProgressPanel';
import { DashboardCharts } from './DashboardCharts';
import { DashboardHero } from './DashboardHero';
import { DashboardQuickActions } from './DashboardQuickActions';
import { buildQuickActions, buildVisiblePaths } from './dashboard-utils';

const HomePage: React.FC = () => {
  const userInfo = useCurrentUserProfile();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: getOverview,
  });

  const visiblePaths = buildVisiblePaths(permissions);
  const canPublish = hasPermissionAccess({
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
  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader title="绩效工作台" visuallyHidden />
      <DashboardHero userName={userInfo?.name} canPublish={canPublish} />
      <DashboardCharts {...overviewState} />
      <div className="grid min-w-0 gap-4 @min-[820px]:grid-cols-[minmax(280px,1fr)_minmax(420px,1.2fr)] @min-[1060px]:grid-cols-[minmax(340px,.9fr)_minmax(520px,1.5fr)]">
        <AssessmentProgressPanel {...overviewState} />
        <DashboardQuickActions
          items={quickActions}
          loading={overviewQuery.isLoading || permissionsLoading}
          error={overviewQuery.error}
          onRetry={() => overviewQuery.refetch()}
        />
      </div>
    </div>
  );
};

export default HomePage;

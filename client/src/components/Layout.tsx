import React from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { navGroups } from './navigation';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-shell/AppSidebar';
import { AppTopbar } from '@/components/app-shell/AppTopbar';
import {
  filterVisibleNavGroups,
  flattenNavItems,
  getCurrentNavLabel,
  getDefaultLandingPath,
} from '@/components/app-shell/app-shell-utils';
import { useSidebarBadges } from '@/components/app-shell/useSidebarBadges';
import { hasPermission } from './permission-policy';
import {
  useBreadcrumb,
  BreadcrumbProvider,
} from '@/components/business-ui/breadcrumb-context';

const LayoutContent: React.FC = () => {
  const { pathname } = useLocation();
  const userInfo = useCurrentUserProfile();
  const { appName } = useAppInfo();
  const { ability, isLoading } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { label: breadcrumbLabel } = useBreadcrumb();
  const loading = isLoading || permissionsLoading;

  const visibleGroups = React.useMemo(
    () =>
      loading
        ? []
        : filterVisibleNavGroups({
            groups: navGroups,
            canRole: (role) => ability.can(role, ROLE_SUBJECT),
            permissions,
          }),
    [ability, loading, permissions],
  );

  const allItems = flattenNavItems(visibleGroups);
  const homePath = loading ? '/' : getDefaultLandingPath(visibleGroups);
  const currentLabel = getCurrentNavLabel(
    pathname,
    visibleGroups,
    breadcrumbLabel,
  );
  const canManageEmployees = hasPermission(permissions, 'employees', 'edit');
  const badges = useSidebarBadges(navGroups.flatMap((g) => g.items));

  if (loading) {
    return (
      <SidebarProvider
        style={{ '--sidebar-width': '220px' } as React.CSSProperties}
      >
        <AppSidebar
          visibleGroups={[]}
          pathname={pathname}
          appName={appName}
          canManageEmployees={false}
          homePath={homePath}
          badges={{}}
        />
        <SidebarInset className="min-w-0 bg-background md:rounded-lg">
          <div className="flex flex-1 flex-col" />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '220px' } as React.CSSProperties}
    >
      <AppSidebar
        visibleGroups={visibleGroups}
        pathname={pathname}
        appName={appName}
        canManageEmployees={canManageEmployees}
        homePath={homePath}
        badges={badges}
      />
        <SidebarInset className="min-w-0 bg-background md:rounded-lg">
        <AppTopbar
          currentLabel={currentLabel}
          items={allItems}
          userInfo={userInfo}
        />
        <div
          key={pathname}
          className="@container/main flex min-w-0 flex-1 flex-col overflow-x-clip px-4 py-5 lg:px-6"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

/** 将 BreadcrumbProvider 放在 LayoutContent 外部，确保 useBreadcrumb 可正确获取 context */
const LayoutWrapper: React.FC = () => (
  <BreadcrumbProvider>
    <LayoutContent />
  </BreadcrumbProvider>
);

export default LayoutWrapper;

import React, { Suspense, useEffect, useRef } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { navGroups } from './navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
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
import { ScrollToTop } from '@/components/app-shell/ScrollToTop';
import {
  useBreadcrumb,
  BreadcrumbProvider,
} from '@/components/business-ui/breadcrumb-context';
import { Spinner } from '@/components/ui/spinner';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // 根据路由标签更新页面标题
  useEffect(() => {
    if (currentLabel) {
      document.title = `${appName} - ${currentLabel}`;
    }
  }, [currentLabel, appName]);

  // 路由切换后将焦点移到内容区 + 滚动至顶部（无障碍：WCAG focus-on-route-change）
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return;
    contentRef.current?.focus();
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname, loading]);

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
        <SidebarInset className="min-w-0 bg-background md:rounded-lg md:peer-data-[variant=inset]:m-[8px]">
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-8" />
          </div>
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
      <SidebarInset className="min-w-0 bg-background md:rounded-lg md:peer-data-[variant=inset]:m-[8px]">
        {/* 跳转到内容：键盘无障碍 skip-link */}
        <UniversalLink
          to="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          跳到内容
        </UniversalLink>
        <AppTopbar
          currentLabel={currentLabel}
          items={allItems}
          userInfo={userInfo}
        />
        <div
          ref={scrollRef}
          key={pathname}
          className="@container/main flex min-w-0 flex-1 flex-col px-4 py-5 lg:px-6 overflow-y-auto min-h-0"
        >
          <div
            id="main-content"
            ref={contentRef}
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl outline-none flex-1 min-h-0 flex flex-col"
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Spinner className="size-6" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </div>
        <ScrollToTop containerRef={scrollRef} />
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

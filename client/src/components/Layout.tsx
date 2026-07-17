import React, { useMemo } from 'react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { hasAnyViewPermission } from './permission-policy';
import { navGroups } from './navigation';
import type { NavItem } from './navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { LayoutDashboard, SunIcon, MoonIcon } from 'lucide-react';
import { UserDisplay } from '@/components/business-ui/user-display';
import {
  useBreadcrumb,
  BreadcrumbProvider,
} from '@/components/business-ui/breadcrumb-context';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

const pathTitleMap: Record<string, string> = {
  '/employees': '员工管理',
  '/template-management': '模板管理',
  '/publish-management': '发布管理',
  '/statistics': '统计查询',
  '/grade-config': '等级配置',
  '/my-assessments': '我的绩效',
  '/team-performance': '团队绩效',
  '/permissions': '权限管理',
  '/dictionary': '字段管理',
};

const LayoutContent: React.FC = () => {
  const { pathname } = useLocation();

  // Restore theme from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);
  const userInfo = useCurrentUserProfile();
  const { appName } = useAppInfo();
  const { ability, isLoading } = useAuth();
  const { permissions } = usePermissions();
  const { label: breadcrumbLabel } = useBreadcrumb();

  const hasPermAccess = (item: NavItem): boolean => {
    if (!item.permissionResources) return true;
    return hasAnyViewPermission(permissions, item.permissionResources);
  };

  const hasIdentityAccess = (item: NavItem): boolean => {
    if (!item.identityRoles) return true;
    if (!ability) return false;
    return item.identityRoles.some((role) => ability.can(role, ROLE_SUBJECT));
  };

  const visibleGroups = useMemo(() => {
    if (isLoading || !ability) return [];
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            hasPermAccess(item) && hasIdentityAccess(item),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [isLoading, ability, permissions]);

  const allItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items),
    [visibleGroups],
  );

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const currentLabel =
    breadcrumbLabel ||
    allItems.find((item) => item.path === pathname)?.label ||
    allItems.find((item) => pathname.startsWith(item.path) && item.path !== '/')
      ?.label ||
    pathTitleMap[pathname] ||
    (pathname.startsWith('/assessment/') ? '绩效详情' : '') ||
    pathname.split('/').pop() ||
    '';

  if (isLoading || !ability) {
    return (
      <SidebarProvider>
        <Sidebar variant="inset" />
        <SidebarInset>
          <div className="flex flex-1 flex-col" />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '220px' } as React.CSSProperties}
    >
      <Sidebar variant="inset" collapsible="offcanvas">
        {/* Header — brand */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <LayoutDashboard className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {appName || '绩效考核'}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Navigation groups */}
        <SidebarContent>
          {visibleGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.path)}
                        tooltip={item.label}
                      >
                        <Link to={item.path}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* Footer — user */}
        <SidebarFooter className="bg-sidebar-accent/30 border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div
                  className="flex items-center gap-2 w-full cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const isDark =
                      document.documentElement.classList.toggle('dark');
                    localStorage.setItem('theme', isDark ? 'dark' : 'light');
                  }}
                >
                  <UserDisplay
                    value={{ user_id: userInfo?.user_id, name: userInfo?.name }}
                    size="medium"
                    showLabel
                  />
                  <MoonIcon className="ml-auto size-4 shrink-0 dark:hidden" />
                  <SunIcon className="ml-auto size-4 shrink-0 hidden dark:block" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* SiteHeader — dashboard-01 style */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbPage className="text-muted-foreground">
                  绩效考核
                </BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Main content — dashboard-01 layout with page transition */}
        <div
          key={pathname}
          className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
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

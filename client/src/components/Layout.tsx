import React, { useMemo } from 'react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { usePermissions } from '@/hooks/usePermissions';
import type { PermissionResource } from '@shared/api.interface';
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
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Send,
  BarChart3,
  Users,
  UserCog,
  Shield,
  Award,
  SunIcon,
  MoonIcon,
  BookOpen,
} from 'lucide-react';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

type NavItem = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  roles: string[];
  permissionResource?: PermissionResource;
};

type NavGroup = {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

const ALL_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor', 'employee'];
const MANAGER_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor'];
const TEMPLATE_ROLES = ['admin', 'hrd', 'dept_head'];
const ADMIN_HRD_ROLES = ['admin', 'hrd'];

const navGroups: NavGroup[] = [
  {
    label: '工作台',
    icon: LayoutDashboard,
    items: [
      {
        label: '首页',
        path: '/',
        icon: LayoutDashboard,
        roles: ALL_ROLES,
        permissionResource: 'dashboard',
      },
      {
        label: '我的绩效',
        path: '/my-assessments',
        icon: ClipboardList,
        roles: ALL_ROLES,
        permissionResource: 'my_assessments',
      },
      {
        label: '团队绩效',
        path: '/team-performance',
        icon: Users,
        roles: MANAGER_ROLES,
        permissionResource: 'team_performance',
      },
    ],
  },
  {
    label: '绩效管理',
    icon: FileText,
    items: [
      {
        label: '模板管理',
        path: '/template-management',
        icon: FileText,
        roles: TEMPLATE_ROLES,
        permissionResource: 'template_management',
      },
      {
        label: '发布管理',
        path: '/publish-management',
        icon: Send,
        roles: MANAGER_ROLES,
        permissionResource: 'publish_management',
      },
      {
        label: '统计查询',
        path: '/statistics',
        icon: BarChart3,
        roles: MANAGER_ROLES,
        permissionResource: 'statistics',
      },
      {
        label: '等级配置',
        path: '/grade-config',
        icon: Award,
        roles: ADMIN_HRD_ROLES,
        permissionResource: 'grade_config',
      },
    ],
  },
  {
    label: '系统设置',
    icon: Shield,
    items: [
      {
        label: '员工管理',
        path: '/employees',
        icon: UserCog,
        roles: MANAGER_ROLES,
        permissionResource: 'employees',
      },
      {
        label: '权限管理',
        path: '/permissions',
        icon: Shield,
        roles: ADMIN_HRD_ROLES,
        permissionResource: 'permission_management',
      },
      {
        label: '字段管理',
        path: '/dictionary',
        icon: BookOpen,
        roles: ADMIN_HRD_ROLES,
        permissionResource: 'dictionary_config',
      },
    ],
  },
];

const pathTitleMap: Record<string, string> = {
  '/': '首页',
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

  const hasPermAccess = (item: NavItem): boolean => {
    if (!item.permissionResource) return true;
    return permissions.some(
      (p) =>
        p.resource === item.permissionResource && p.actions.includes('view'),
    );
  };

  const visibleGroups = useMemo(() => {
    if (isLoading) return [];
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.roles.some((r) => ability.can(r, ROLE_SUBJECT)) &&
            hasPermAccess(item),
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
    allItems.find((item) => item.path === pathname)?.label ||
    allItems.find((item) => pathname.startsWith(item.path) && item.path !== '/')
      ?.label ||
    pathTitleMap[pathname] ||
    pathname.split('/').pop() ||
    '';

  if (isLoading) {
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
                    userId={userInfo?.user_id}
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

export default LayoutContent;

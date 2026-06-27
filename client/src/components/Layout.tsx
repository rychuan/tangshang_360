import React from 'react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useAppInfo } from '@lark-apaas/client-toolkit/hooks/useAppInfo';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
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
} from 'lucide-react';
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
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const ALL_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor', 'employee'];
const MANAGER_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor'];
const TEMPLATE_ROLES = ['admin', 'hrd', 'dept_head'];
const ADMIN_HRD_ROLES = ['admin', 'hrd'];

const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [
      {
        label: '首页',
        path: '/',
        icon: LayoutDashboard,
        roles: ALL_ROLES,
      },
      {
        label: '我的绩效',
        path: '/my-assessments',
        icon: ClipboardList,
        roles: ALL_ROLES,
      },
      {
        label: '团队绩效',
        path: '/team-performance',
        icon: Users,
        roles: MANAGER_ROLES,
      },
    ],
  },
  {
    label: '绩效管理',
    items: [
      {
        label: '绩效模板',
        path: '/template-management',
        icon: FileText,
        roles: TEMPLATE_ROLES,
      },
      {
        label: '绩效发布',
        path: '/publish-management',
        icon: Send,
        roles: MANAGER_ROLES,
      },
      {
        label: '绩效统计',
        path: '/statistics',
        icon: BarChart3,
        roles: MANAGER_ROLES,
      },
      {
        label: '绩效等级',
        path: '/grade-config',
        icon: Award,
        roles: ADMIN_HRD_ROLES,
      },
    ],
  },
  {
    label: '系统设置',
    items: [
      {
        label: '员工管理',
        path: '/employees',
        icon: UserCog,
        roles: MANAGER_ROLES,
      },
      {
        label: '权限管理',
        path: '/permissions',
        icon: Shield,
        roles: ADMIN_HRD_ROLES,
      },
    ],
  },
];

const pathTitleMap: Record<string, string> = {
  '/': '首页',
  '/employees': '员工管理',
  '/template-management': '绩效模板管理',
  '/publish-management': '绩效发布管理',
  '/statistics': '绩效统计查询',
  '/grade-config': '绩效等级配置',
  '/my-assessments': '我的绩效',
  '/team-performance': '团队绩效',
  '/permissions': '权限管理',
};

const LayoutContent: React.FC = () => {
  const { pathname } = useLocation();
  const userInfo = useCurrentUserProfile();
  const { appName } = useAppInfo();
  const { ability, isLoading } = useAuth();

  const navItems = isLoading
    ? []
    : navGroups.flatMap((group) =>
        group.items.filter((item) =>
          item.roles.some((r) => ability.can(r, ROLE_SUBJECT)),
        ),
      );

  const navGroupItems = isLoading
    ? []
    : navGroups
        .map((group) => ({
          label: group.label,
          items: group.items.filter((item) =>
            item.roles.some((r) => ability.can(r, ROLE_SUBJECT)),
          ),
        }))
        .filter((group) => group.items.length > 0);

  const currentLabel =
    navItems.find((item) => item.path === pathname)?.label ||
    navItems.find((item) => pathname.startsWith(item.path) && item.path !== '/')
      ?.label ||
    pathTitleMap[pathname] ||
    pathname.split('/').pop() ||
    '';

  const isActive = (itemPath: string) =>
    itemPath === '/' ? pathname === '/' : pathname.startsWith(itemPath);

  if (isLoading) {
    return (
      <SidebarProvider
        style={
          {
            '--sidebar-width': '150px',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <Sidebar variant="inset" />
        <SidebarInset>
          <div className="flex flex-1 flex-col" />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '220px',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <LayoutDashboard className="size-5" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="text-base font-semibold">
                      {appName || '绩效考核'}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {navGroupItems.map((group, groupIdx) => (
            <React.Fragment key={group.label}>
              {groupIdx > 0 && <SidebarSeparator className="mx-3" />}
              <SidebarGroup>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.path)}
                          tooltip={item.label}
                          className="data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:rounded-l-none"
                        >
                          <Link to={item.path}>
                            <item.icon className="size-5" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </React.Fragment>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-sm font-medium">
                  {userInfo?.name?.[0] || 'U'}
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-sm font-medium truncate">
                    {userInfo?.name || '用户'}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4">
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
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default LayoutContent;

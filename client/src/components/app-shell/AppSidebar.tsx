import { Link } from 'react-router-dom';
import { Icon } from '@iconify/react';
import type { NavGroup } from '@/components/navigation';
import type { SidebarBadges } from '@/components/app-shell/useSidebarBadges';
import { formatCurrentCycle } from '@/components/app-shell/app-shell-utils';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

export interface AppSidebarProps {
  visibleGroups: NavGroup[];
  pathname: string;
  appName?: string | null;
  canManageEmployees: boolean;
  homePath: string;
  badges: SidebarBadges;
}

function isActivePath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar({
  visibleGroups,
  pathname,
  appName,
  canManageEmployees,
  homePath,
  badges,
}: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon" className="[font-size:14px]">
      <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:p-1.5 group-data-[collapsible=icon]:gap-1">
        <Link to={homePath} className="flex h-10 items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="grid size-8 place-items-center rounded-lg bg-[#171720] text-white">
            <Icon icon="hugeicons:dashboard-square-02" className="size-4" />
          </span>
          <span className="truncate text-[16px] font-semibold group-data-[collapsible=icon]:hidden">
            {appName || '绩效考核'}
          </span>
        </Link>
        <div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-[12px] group-data-[collapsible=icon]:hidden">
          <Icon icon="hugeicons:calendar-03" className="size-4 text-warning" />
          <span>{formatCurrentCycle(new Date())}</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="px-0">
            <SidebarGroupLabel className="px-3 text-[11px]">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, item.path)}
                      className="h-10 rounded-lg px-3 text-[14px] data-[active=true]:border data-[active=true]:bg-background data-[active=true]:shadow-xs"
                    >
                      <Link to={item.path}>
                        <Icon icon={item.icon} className="size-4" />
                        <span>{item.label}</span>
                        {badges[item.path] && (
                          <span
                            className={
                              `ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none ${
                                badges[item.path].tone === 'warning'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : badges[item.path].tone === 'destructive'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : badges[item.path].tone === 'success'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-muted text-muted-foreground'
                              }`
                            }
                          >
                            {badges[item.path].text}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        {canManageEmployees && (
          <Button asChild variant="outline" className="h-auto justify-start p-3">
            <Link to="/employees">
              <Icon icon="hugeicons:user-add-01" className="size-4" />
              <span>邀请团队成员</span>
            </Link>
          </Button>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

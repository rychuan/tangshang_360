import { Link } from 'react-router-dom';
import { CalendarDays, Gauge, UserPlus } from 'lucide-react';
import type { NavGroup } from '@/components/navigation';
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
  canViewEmployees: boolean;
}

function isActivePath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar({
  visibleGroups,
  pathname,
  appName,
  canViewEmployees,
}: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="offcanvas" className="[font-size:14px]">
      <SidebarHeader className="gap-3 p-3">
        <Link to="/dashboard" className="flex h-10 items-center gap-3 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[#171720] text-white">
            <Gauge className="size-4" />
          </span>
          <span className="truncate text-[16px] font-semibold">
            {appName || '绩效考核'}
          </span>
        </Link>
        <div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-[12px]">
          <CalendarDays className="size-4 text-warning" />
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
                        <item.icon className="size-4" />
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
      <SidebarFooter>
        {canViewEmployees && (
          <Button asChild variant="outline" className="h-auto justify-start p-3">
            <Link to="/employees">
              <UserPlus className="size-4" />
              <span>邀请团队成员</span>
            </Link>
          </Button>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

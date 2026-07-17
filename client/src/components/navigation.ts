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
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionResource } from '@shared/api.interface';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permissionResources?: PermissionResource[];
  identityRoles?: string[];
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    icon: LayoutDashboard,
    items: [
      {
        label: '绩效工作台',
        path: '/dashboard',
        icon: LayoutDashboard,
        permissionResources: ['dashboard'],
      },
      {
        label: '我的绩效',
        path: '/my-assessments',
        icon: ClipboardList,
        permissionResources: ['my_assessments'],
      },
      {
        label: '团队绩效',
        path: '/team-performance',
        icon: Users,
        permissionResources: ['team_performance'],
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
        permissionResources: ['template_management'],
      },
      {
        label: '发布管理',
        path: '/publish-management',
        icon: Send,
        permissionResources: ['publish_management'],
      },
      {
        label: '统计查询',
        path: '/statistics',
        icon: BarChart3,
        permissionResources: ['statistics'],
      },
      {
        label: '等级配置',
        path: '/grade-config',
        icon: Award,
        permissionResources: ['grade_config'],
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
        permissionResources: ['employees', 'organization'],
      },
      {
        label: '权限管理',
        path: '/permissions',
        icon: Shield,
        permissionResources: ['permission_management'],
        identityRoles: ['admin', 'hrd'],
      },
      {
        label: '字段管理',
        path: '/dictionary',
        icon: BookOpen,
        permissionResources: ['dictionary_config'],
      },
    ],
  },
];

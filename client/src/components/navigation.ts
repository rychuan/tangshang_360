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
import {
  ALL_ROLES,
  MANAGER_ROLES,
  TEMPLATE_ROLES,
  ADMIN_HRD_ROLES,
} from './role-constants';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: string[];
  permissionResource?: PermissionResource;
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

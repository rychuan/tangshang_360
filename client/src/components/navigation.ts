import type { PermissionResource } from '@shared/api.interface';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  permissionResources?: PermissionResource[];
  identityRoles?: string[];
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    icon: 'hugeicons:dashboard-square-02',
    items: [
      {
        label: '绩效工作台',
        path: '/dashboard',
        icon: 'hugeicons:dashboard-square-02',
        permissionResources: ['dashboard'],
      },
      {
        label: '我的绩效',
        path: '/my-assessments',
        icon: 'hugeicons:task-01',
        permissionResources: ['my_assessments'],
      },
      {
        label: '团队绩效',
        path: '/team-performance',
        icon: 'hugeicons:team',
        permissionResources: ['team_performance'],
      },
    ],
  },
  {
    label: '绩效管理',
    icon: 'hugeicons:note',
    items: [
      {
        label: '模板管理',
        path: '/template-management',
        icon: 'hugeicons:note',
        permissionResources: ['template_management'],
      },
      {
        label: '发布管理',
        path: '/publish-management',
        icon: 'hugeicons:rocket-01',
        permissionResources: ['publish_management'],
      },
      {
        label: '统计查询',
        path: '/statistics',
        icon: 'hugeicons:chart-bar-line',
        permissionResources: ['statistics'],
      },
      {
        label: '等级配置',
        path: '/grade-config',
        icon: 'hugeicons:crown',
        permissionResources: ['grade_config'],
      },
    ],
  },
  {
    label: '系统设置',
    icon: 'hugeicons:security-lock',
    items: [
      {
        label: '员工管理',
        path: '/employees',
        icon: 'hugeicons:user-id-verification',
        permissionResources: ['employees', 'organization'],
      },
      {
        label: '权限管理',
        path: '/permissions',
        icon: 'hugeicons:security-lock',
        permissionResources: ['permission_management'],
        identityRoles: ['admin', 'hrd'],
      },
      {
        label: '字段管理',
        path: '/dictionary',
        icon: 'hugeicons:book-01',
        permissionResources: ['dictionary_config'],
      },
    ],
  },
];

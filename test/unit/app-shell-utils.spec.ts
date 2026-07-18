import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  filterNavItems,
  filterVisibleNavGroups,
  formatCurrentCycle,
  getDefaultLandingPath,
  getCurrentNavLabel,
  hasPermissionAccess,
} from '../../client/src/components/app-shell/app-shell-utils';
import type { NavGroup } from '../../client/src/components/navigation';

const groups: NavGroup[] = [
  {
    label: '工作台',
    icon: (() => null) as never,
    items: [
      {
        label: '绩效工作台',
        path: '/dashboard',
        icon: (() => null) as never,
        permissionResources: ['dashboard'],
      },
      {
        label: '员工管理',
        path: '/employees',
        icon: (() => null) as never,
        permissionResources: ['employees', 'organization'],
      },
      {
        label: '我的绩效',
        path: '/my-assessments',
        icon: (() => null) as never,
        permissionResources: ['my_assessments'],
      },
    ],
  },
];

describe('app shell navigation utilities', () => {
  it('使用资源查看权限过滤普通导航', () => {
    const visible = filterVisibleNavGroups({
      groups,
      canRole: () => false,
      permissions: [{ resource: 'dashboard', actions: ['view'] }],
    });
    expect(visible[0].items.map((item) => item.path)).toEqual(['/dashboard']);
  });

  it('导航配置多个资源时任一资源具备查看权限即可显示', () => {
    const visible = filterVisibleNavGroups({
      groups,
      canRole: () => false,
      permissions: [{ resource: 'organization', actions: ['view'] }],
    });

    expect(visible[0].items.map((item) => item.path)).toEqual(['/employees']);
  });

  it('快捷入口只要求资源动作', () => {
    const publishPermission = [
      { resource: 'publish_management' as const, actions: ['publish' as const] },
    ];
    const employeePermission = [
      { resource: 'employees' as const, actions: ['view' as const] },
    ];

    expect(
      hasPermissionAccess({
        permissions: publishPermission,
        resource: 'publish_management',
        action: 'publish',
      }),
    ).toBe(true);
    expect(
      hasPermissionAccess({
        permissions: [],
        resource: 'publish_management',
        action: 'publish',
      }),
    ).toBe(false);
    expect(
      hasPermissionAccess({
        permissions: employeePermission,
        resource: 'employees',
        action: 'view',
      }),
    ).toBe(true);
  });

  it('默认入口选择角色和资源过滤后的第一个真实路径', () => {
    const visible = filterVisibleNavGroups({
      groups,
      canRole: () => false,
      permissions: [{ resource: 'my_assessments', actions: ['view'] }],
    });

    expect(getDefaultLandingPath(visible)).toBe('/my-assessments');
  });

  it('没有可访问导航时默认入口返回 403', () => {
    expect(getDefaultLandingPath([])).toBe('/403');
  });

  it('品牌链接使用动态 home path 而不是固定 dashboard', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../client/src/components/app-shell/AppSidebar.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('homePath: string;');
    expect(source).toContain('<Link to={homePath}');
    expect(source).not.toContain('<Link to="/dashboard"');
  });

  it('按页面名称过滤命令结果', () => {
    expect(
      filterNavItems(groups[0].items, '员工').map((item) => item.path),
    ).toEqual(['/employees']);
  });

  it('优先匹配完整路径并支持详情页标题回退', () => {
    expect(getCurrentNavLabel('/dashboard', groups, '')).toBe('绩效工作台');
    expect(getCurrentNavLabel('/assessment/1', groups, '')).toBe('绩效详情');
  });

  it('生成中文考核周期', () => {
    expect(formatCurrentCycle(new Date('2026-07-17T00:00:00+08:00'))).toBe(
      '2026 年 7 月考核周期',
    );
  });
});

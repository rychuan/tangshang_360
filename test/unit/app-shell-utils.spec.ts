import {
  filterNavItems,
  filterVisibleNavGroups,
  formatCurrentCycle,
  getCurrentNavLabel,
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
        roles: ['employee'],
        permissionResource: 'dashboard',
      },
      {
        label: '员工管理',
        path: '/employees',
        icon: (() => null) as never,
        roles: ['hrd'],
        permissionResource: 'employees',
      },
    ],
  },
];

describe('app shell navigation utilities', () => {
  it('同时应用角色和资源查看权限', () => {
    const visible = filterVisibleNavGroups({
      groups,
      canRole: (role) => role === 'employee',
      permissions: [{ resource: 'dashboard', actions: ['view'] }],
    });
    expect(visible[0].items.map((item) => item.path)).toEqual(['/dashboard']);
  });

  it('按页面名称过滤命令结果', () => {
    expect(filterNavItems(groups[0].items, '员工').map((item) => item.path)).toEqual([
      '/employees',
    ]);
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

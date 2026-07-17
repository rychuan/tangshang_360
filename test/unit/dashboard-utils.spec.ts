import {
  buildProgress,
  buildQuickActions,
  buildVisiblePaths,
  getGreeting,
  mapGradeDistribution,
  resolveSectionStatus,
} from '../../client/src/pages/HomePage/dashboard-utils';

describe('dashboard view utilities', () => {
  it.each([
    [8, '早上好'],
    [11, '早上好'],
    [12, '下午好'],
    [17, '下午好'],
    [18, '晚上好'],
  ])('根据小时 %s 返回问候语', (hour, expected) => {
    const date = new Date('2026-07-17T00:00:00+08:00');
    date.setHours(hour);
    expect(getGreeting(date)).toBe(expected);
  });

  it('使用完成和待处理数量计算可信进度', () => {
    expect(buildProgress({ completedCount: 39, pendingCount: 11 })).toEqual({
      completed: 39,
      pending: 11,
      total: 50,
      percentage: 78,
    });
  });

  it('总数为零时返回零进度', () => {
    expect(buildProgress({ completedCount: 0, pendingCount: 0 })).toEqual({
      completed: 0,
      pending: 0,
      total: 0,
      percentage: 0,
    });
  });

  it('过滤无权限、根路径和重复快捷入口', () => {
    const result = buildQuickActions(
      [
        { title: '员工管理', path: '/employees' },
        { title: '我的自评', path: '/' },
        { title: '员工管理', path: '/employees' },
      ],
      new Set(['/employees']),
    );
    expect(result.map((item) => item.path)).toEqual(['/employees']);
  });

  it('保留导航支持的全部合法快捷入口', () => {
    const paths = [
      '/permissions',
      '/team-performance',
      '/grade-config',
      '/dictionary',
    ];
    const result = buildQuickActions(
      paths.map((path) => ({ title: path, path })),
      new Set(paths),
    );

    expect(result.map((item) => item.path)).toEqual(paths);
  });

  it('从资源查看权限构建全部可见导航路径', () => {
    expect(
      [...buildVisiblePaths([
        { resource: 'dashboard', actions: ['view'] },
        { resource: 'my_assessments', actions: ['view'] },
        { resource: 'employees', actions: ['view'] },
        { resource: 'template_management', actions: ['view'] },
        { resource: 'publish_management', actions: ['view'] },
        { resource: 'statistics', actions: ['view'] },
        { resource: 'team_performance', actions: ['view'] },
        { resource: 'permission_management', actions: ['view'] },
        { resource: 'grade_config', actions: ['view'] },
        { resource: 'dictionary_config', actions: ['view'] },
        { resource: 'organization', actions: ['edit'] },
      ])],
    ).toEqual([
      '/dashboard',
      '/my-assessments',
      '/employees',
      '/template-management',
      '/publish-management',
      '/statistics',
      '/team-performance',
      '/permissions',
      '/grade-config',
      '/dictionary',
    ]);
  });

  it('将等级分布稳定排序', () => {
    expect(mapGradeDistribution({ B: 2, A: 4 })).toEqual([
      { grade: 'A', count: 4 },
      { grade: 'B', count: 2 },
    ]);
  });

  it('有成功数据时不被同一查询的旧错误覆盖', () => {
    expect(
      resolveSectionStatus({
        hasData: true,
        loading: false,
        error: new Error('旧错误'),
      }),
    ).toBe('ready');
  });

  it('两个区块可以独立解析为成功和失败', () => {
    expect(
      resolveSectionStatus({ hasData: true, loading: false, error: null }),
    ).toBe('ready');
    expect(
      resolveSectionStatus({
        hasData: false,
        loading: false,
        error: new Error('概览失败'),
      }),
    ).toBe('error');
  });
});

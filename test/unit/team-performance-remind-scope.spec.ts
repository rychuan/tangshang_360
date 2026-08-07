import { TeamPerformanceService } from '../../server/modules/team-performance/team-performance.service';

describe('team performance reminder scope', () => {
  function createUnlockDb(status: string) {
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ status }]),
    };
    return { select: jest.fn().mockReturnValue(query) };
  }

  it('delegates unlock to UnlockService when status is supervisor_review', async () => {
    const db = createUnlockDb('supervisor_review');
    const capabilityService = { load: jest.fn() };
    const accessScopeService = { canAccessEmployees: jest.fn() };
    const unlockService = {
      unlock: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new (TeamPerformanceService as any)(
      db,
      capabilityService,
      accessScopeService,
      unlockService,
    ) as TeamPerformanceService;

    const result = await service.unlock(
      'instance-1',
      { reason: '重新评分' },
      'manager-1',
    );

    expect(unlockService.unlock).toHaveBeenCalledWith(
      'instance-1',
      { reason: '重新评分' },
      'manager-1',
    );
    expect(result).toEqual({ success: true });
  });

  it.each(['self_review', 'completed'] as const)(
    'rejects unlock for frozen status %s without touching UnlockService',
    async (status) => {
      const db = createUnlockDb(status);
      const unlockService = { unlock: jest.fn() };
      const service = new (TeamPerformanceService as any)(
        db,
        { load: jest.fn() },
        { canAccessEmployees: jest.fn() },
        unlockService,
      ) as TeamPerformanceService;

      await expect(
        service.unlock('instance-1', { reason: '重新评分' }, 'manager-1'),
      ).rejects.toThrow('当前考核状态不允许解锁');
      expect(unlockService.unlock).not.toHaveBeenCalled();
    },
  );

  it('checks object scope before returning a distinguishable instance status', async () => {
    // 新实现：批量查询实例（where 直接 resolve 数组，无 limit），
    // 范围判定一次调用 canAccessEmployees（返回 Map）
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        {
          id: 'instance-1',
          period: '2026-07',
          status: 'completed',
          employeeUserId: 'employee-2',
          employeeName: '员工二',
        },
      ]),
    };
    const db = {
      select: jest.fn().mockReturnValue(instanceQuery),
    };
    const capabilityService = {
      load: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployees: jest
        .fn()
        .mockResolvedValue(new Map([['employee-2', false]])),
    };
    const unlockService = { unlock: jest.fn() };
    const service = new (TeamPerformanceService as any)(
      db,
      capabilityService,
      accessScopeService,
      unlockService,
    ) as TeamPerformanceService;

    const result = await service.remind('manager-1', {
      instanceIds: ['instance-1'],
    });

    expect(accessScopeService.canAccessEmployees).toHaveBeenCalledWith(
      'manager-1',
      ['employee-2'],
      { includeSelf: false },
    );
    expect(result.results).toEqual([
      {
        instanceId: 'instance-1',
        status: 'failed',
        reason: '考核实例不存在或无权操作',
      },
    ]);
    expect(capabilityService.load).not.toHaveBeenCalled();
  });
});

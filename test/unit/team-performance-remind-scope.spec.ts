import { TeamPerformanceService } from '../../server/modules/team-performance/team-performance.service';

describe('team performance reminder scope', () => {
  it('delegates unlock to UnlockService', async () => {
    const db = { select: jest.fn() };
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

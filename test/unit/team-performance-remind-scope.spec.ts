import { TeamPerformanceService } from '../../server/modules/team-performance/team-performance.service';

describe('team performance reminder scope', () => {
  it('checks object scope before returning a distinguishable instance status', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
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
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (TeamPerformanceService as any)(
      db,
      capabilityService,
      accessScopeService,
    ) as TeamPerformanceService;

    const result = await service.remind('manager-1', {
      instanceIds: ['instance-1'],
    });

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
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

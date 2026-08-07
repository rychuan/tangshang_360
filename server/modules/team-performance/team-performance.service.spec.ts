import { TeamPerformanceService } from './team-performance.service';
import { assessmentInstance } from '@server/database/schema';

/**
 * remind 批量优化回归：实例批量查询 + 一次范围判定（canAccessEmployees），
 * 结果顺序与错误语义必须与逐条实现完全一致。
 */

interface InstanceRow {
  id: string;
  period: string;
  status: string;
  employeeUserId: string;
  employeeName: string;
}

function createDbMock(instances: InstanceRow[]) {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => {
          if (table === assessmentInstance) {
            return Promise.resolve(instances);
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  };
  return db;
}

const accessScopeService = {
  canAccessEmployees: jest.fn(),
};

const unlockService = {
  unlock: jest.fn(),
};

function createCapabilityMock() {
  return {
    load: jest.fn(() => ({
      call: jest.fn(async () => ({ success: true })),
    })),
  };
}

function createService(db: unknown, capability: unknown) {
  return new TeamPerformanceService(
    db as never,
    capability as never,
    accessScopeService as never,
    unlockService as never,
  );
}

const SELF_REVIEW = 'self_review';

describe('TeamPerformanceService.remind', () => {
  const callerUserId = 'u_supervisor';

  beforeEach(() => {
    jest.clearAllMocks();
    accessScopeService.canAccessEmployees.mockResolvedValue(
      new Map([
        ['u_a', true],
        ['u_b', true],
        ['u_c', false],
      ]),
    );
  });

  test('全部合法实例 → 全部 sent；范围判定只调用一次（批量）', async () => {
    const db = createDbMock([
      {
        id: 'inst-1',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_a',
        employeeName: '甲',
      },
      {
        id: 'inst-2',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_b',
        employeeName: '乙',
      },
    ]);
    const capability = createCapabilityMock();
    const service = createService(db, capability);

    const res = await service.remind(callerUserId, {
      instanceIds: ['inst-1', 'inst-2'],
    });

    expect(res.success).toBe(true);
    expect(res.results.map((r) => r.status)).toEqual(['sent', 'sent']);
    expect(accessScopeService.canAccessEmployees).toHaveBeenCalledTimes(1);
    expect(accessScopeService.canAccessEmployees).toHaveBeenCalledWith(
      callerUserId,
      ['u_a', 'u_b'],
      { includeSelf: false },
    );
    expect(capability.load).toHaveBeenCalledTimes(2);
  });

  test('无权实例 → "考核实例不存在或无权操作"，其余正常', async () => {
    const db = createDbMock([
      {
        id: 'inst-1',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_a',
        employeeName: '甲',
      },
      {
        id: 'inst-2',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_c',
        employeeName: '丙',
      },
    ]);
    const service = createService(db, createCapabilityMock());

    const res = await service.remind(callerUserId, {
      instanceIds: ['inst-1', 'inst-2'],
    });

    expect(res.results.map((r) => r.status)).toEqual(['sent', 'failed']);
    expect(res.results[1].reason).toBe('考核实例不存在或无权操作');
  });

  test('状态非 self_review → "当前考核状态不允许催办"', async () => {
    const db = createDbMock([
      {
        id: 'inst-1',
        period: '2026-07',
        status: 'completed',
        employeeUserId: 'u_a',
        employeeName: '甲',
      },
    ]);
    const service = createService(db, createCapabilityMock());

    const res = await service.remind(callerUserId, {
      instanceIds: ['inst-1'],
    });

    expect(res.results[0].status).toBe('failed');
    expect(res.results[0].reason).toBe('当前考核状态不允许催办');
  });

  test('不存在的实例 → "考核实例不存在"', async () => {
    const db = createDbMock([]);
    const service = createService(db, createCapabilityMock());

    const res = await service.remind(callerUserId, {
      instanceIds: ['inst-missing'],
    });

    expect(res.results[0].status).toBe('failed');
    expect(res.results[0].reason).toBe('考核实例不存在');
  });

  test('混合场景：结果顺序与请求顺序一致', async () => {
    const db = createDbMock([
      {
        id: 'inst-a',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_a',
        employeeName: '甲',
      },
      {
        id: 'inst-b',
        period: '2026-07',
        status: 'completed',
        employeeUserId: 'u_b',
        employeeName: '乙',
      },
      {
        id: 'inst-c',
        period: '2026-07',
        status: SELF_REVIEW,
        employeeUserId: 'u_c',
        employeeName: '丙',
      },
    ]);
    const service = createService(db, createCapabilityMock());

    const res = await service.remind(callerUserId, {
      instanceIds: ['inst-a', 'inst-b', 'inst-c', 'inst-missing'],
    });

    expect(res.results.map((r) => r.status)).toEqual([
      'sent',
      'failed',
      'failed',
      'failed',
    ]);
    expect(res.results[1].reason).toBe('当前考核状态不允许催办');
    expect(res.results[2].reason).toBe('考核实例不存在或无权操作');
    expect(res.results[3].reason).toBe('考核实例不存在');
  });

  test('空 instanceIds → 抛"实例不能为空"（assertBatchSize 既有行为）', async () => {
    const db = createDbMock([]);
    const service = createService(db, createCapabilityMock());

    await expect(
      service.remind(callerUserId, { instanceIds: [] }),
    ).rejects.toThrow('实例不能为空');
  });
});

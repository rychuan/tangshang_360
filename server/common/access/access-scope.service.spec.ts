import { AccessScopeService } from './access-scope.service';
import { department, employee } from '@server/database/schema';

/**
 * canAccessEmployees 批量范围判定：语义必须与 canAccessEmployee 一致——
 * global 放行；停用/删除员工拒绝；自己按 includeSelf；下属放行；部门成员放行。
 * 一次 getScope + 一次员工查询完成全部判定（消除逐条 N+1）。
 */

interface DbOptions {
  departmentRows?: { id: string }[];
  subordinateRows?: { userId: string }[];
  targetRows?: { departmentId: string | null; userId: string }[];
}

function createDbMock(opts: DbOptions = {}) {
  const db = {
    select: jest.fn((fields: Record<string, unknown>) => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => {
          if (table === department) {
            return Promise.resolve(opts.departmentRows ?? []);
          }
          // canAccessEmployees 批量查询（含 departmentId 字段）
          if (fields.departmentId) {
            return Promise.resolve(opts.targetRows ?? []);
          }
          // getScope callerRows（含 id 字段）
          if (fields.id) {
            return { limit: jest.fn(async () => [{}]) };
          }
          // 下属查询（userId 字段）
          return Promise.resolve(opts.subordinateRows ?? []);
        }),
      })),
    })),
  };
  return db;
}

const roleManagerService = {
  getUserRoles: jest.fn(),
};

function createService(db: unknown, roles: string[]) {
  roleManagerService.getUserRoles.mockResolvedValue(roles);
  return new AccessScopeService(db as never, roleManagerService as never);
}

describe('AccessScopeService.canAccessEmployees', () => {
  const callerUserId = 'u_caller';

  test('global 范围（admin/hrd）对任意员工放行，即使目标不存在', async () => {
    const db = createDbMock();
    const service = createService(db, ['admin']);

    const map = await service.canAccessEmployees(
      callerUserId,
      ['u_any', 'u_missing'],
      { includeSelf: false },
    );

    expect(map.get('u_any')).toBe(true);
    expect(map.get('u_missing')).toBe(true);
  });

  test('dept_head：部门成员放行、跨部门非下属拒绝', async () => {
    const db = createDbMock({
      departmentRows: [{ id: 'dept-1' }],
      targetRows: [
        { departmentId: 'dept-1', userId: 'u_dept_member' },
        { departmentId: 'dept-2', userId: 'u_cross_dept' },
        { departmentId: 'dept-1', userId: callerUserId },
      ],
    });
    const service = createService(db, ['dept_head']);

    const map = await service.canAccessEmployees(
      callerUserId,
      ['u_dept_member', 'u_cross_dept', callerUserId],
      { includeSelf: false },
    );

    expect(map.get('u_dept_member')).toBe(true);
    expect(map.get('u_cross_dept')).toBe(false);
    expect(map.get(callerUserId)).toBe(false);
  });

  test('supervisor：直接下属放行（跨部门也放行）；includeSelf 控制自己', async () => {
    const db = createDbMock({
      subordinateRows: [{ userId: 'u_sub_cross' }],
      targetRows: [
        { departmentId: 'dept-9', userId: 'u_sub_cross' },
        { departmentId: 'dept-9', userId: callerUserId },
      ],
    });
    const service = createService(db, ['supervisor']);

    const withoutSelf = await service.canAccessEmployees(
      callerUserId,
      ['u_sub_cross', callerUserId],
      { includeSelf: false },
    );
    const withSelf = await service.canAccessEmployees(
      callerUserId,
      [callerUserId],
      { includeSelf: true },
    );

    expect(withoutSelf.get('u_sub_cross')).toBe(true);
    expect(withoutSelf.get(callerUserId)).toBe(false);
    expect(withSelf.get(callerUserId)).toBe(true);
  });

  test('目标员工不存在/停用/删除 → 拒绝（即使在下属集外）', async () => {
    const db = createDbMock({
      departmentRows: [{ id: 'dept-1' }],
      targetRows: [],
    });
    const service = createService(db, ['dept_head']);

    const map = await service.canAccessEmployees(callerUserId, ['u_gone'], {
      includeSelf: false,
    });

    expect(map.get('u_gone')).toBe(false);
  });

  test('批量去重：重复 id 只判定一次且结果一致', async () => {
    const db = createDbMock({
      departmentRows: [{ id: 'dept-1' }],
      targetRows: [{ departmentId: 'dept-1', userId: 'u_a' }],
    });
    const service = createService(db, ['dept_head']);

    const map = await service.canAccessEmployees(
      callerUserId,
      ['u_a', 'u_a', 'u_a'],
      { includeSelf: false },
    );

    expect(map.get('u_a')).toBe(true);
    expect(db.select.mock.calls.length).toBeLessThanOrEqual(4);
  });

  test('self 范围（无角色）对他人一律拒绝', async () => {
    const db = createDbMock();
    const service = createService(db, []);

    const map = await service.canAccessEmployees(callerUserId, ['u_other'], {
      includeSelf: false,
    });

    expect(map.get('u_other')).toBe(false);
  });
});

describe('AccessScopeService.getManagedEmployeeIds（列表路径范围判定）', () => {
  const callerUserId = 'u_caller';

  /**
   * 模拟 getManagedEmployeeIds 的调用链：
   * getScope（调用方存在性 id 查询 / dept_head 的 department 查询 / supervisor 的下属 userId 查询）
   * → 最终范围 userId 查询（捕获 where 条件以便断言 SQL 谓词）。
   */
  function createScopeDbMock(
    roles: string[],
    opts: {
      departmentRows?: { id: string }[];
      subordinateRows?: { userId: string }[];
      finalRows?: { userId: string }[];
    } = {},
  ) {
    const finalQueryConditions: unknown[] = [];
    let userIdQueryCount = 0;
    const db = {
      select: jest.fn((fields: Record<string, unknown>) => ({
        from: jest.fn((table: unknown) => ({
          where: jest.fn((...args: unknown[]) => {
            if (table === department) {
              return Promise.resolve(opts.departmentRows ?? []);
            }
            // 调用方存在性查询（select id）
            if (fields.id) {
              return { limit: jest.fn(async () => [{}]) };
            }
            // userId 查询：getScope 下属查询（仅 supervisor）+ 最终范围查询
            if (fields.userId) {
              userIdQueryCount += 1;
              const isFinal = roles.includes('supervisor')
                ? userIdQueryCount > 1
                : userIdQueryCount >= 1;
              if (isFinal) {
                finalQueryConditions.push(args[0]);
                return Promise.resolve(opts.finalRows ?? []);
              }
              return Promise.resolve(opts.subordinateRows ?? []);
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    };
    return { db, finalQueryConditions };
  }

  function conditionQuery(cond: unknown): string {
    // drizzle SQL 对象：queryChunks 递归拼接（StringChunk.value 为字符数组）
    const out: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { queryChunks?: unknown; value?: unknown };
      if (Array.isArray(n.queryChunks)) {
        for (const ch of n.queryChunks) walk(ch);
        return;
      }
      if (Array.isArray(n.value)) out.push(n.value.join(''));
      else if (typeof n.value === 'string') out.push(n.value);
    };
    walk(cond);
    return out.join('');
  }

  test('dept_head：仅部门成员进入范围，跨部门直接汇报人不在范围内', async () => {
    const { db, finalQueryConditions } = createScopeDbMock(
      ['dept_head'],
      {
        departmentRows: [{ id: 'dept-1' }],
        finalRows: [{ userId: 'u_dept_member' }],
      },
    );
    const service = new AccessScopeService(
      db as never,
      { getUserRoles: jest.fn().mockResolvedValue(['dept_head']) } as never,
    );

    const ids = await service.getManagedEmployeeIds(callerUserId, {
      includeSelf: false,
    });

    expect(ids).toEqual(['u_dept_member']);
    // 最终范围条件只含部门 IN 谓词，不得包含 supervisor 谓词（跨部门直接汇报人不越界）
    const cond = conditionQuery(finalQueryConditions[0]);
    expect(cond).toContain(' IN (');
    expect(cond).not.toContain('.user_id =');
  });

  test('supervisor：直接下属（含跨部门）进入范围，且部门谓词为 FALSE', async () => {
    const { db, finalQueryConditions } = createScopeDbMock(
      ['supervisor'],
      {
        subordinateRows: [{ userId: 'u_sub_cross_dept' }],
        finalRows: [{ userId: 'u_sub_cross_dept' }],
      },
    );
    const service = new AccessScopeService(
      db as never,
      { getUserRoles: jest.fn().mockResolvedValue(['supervisor']) } as never,
    );

    const ids = await service.getManagedEmployeeIds(callerUserId, {
      includeSelf: false,
    });

    expect(ids).toEqual(['u_sub_cross_dept']);
    const cond = conditionQuery(finalQueryConditions[0]);
    expect(cond).toContain('.user_id =');
    expect(cond).toContain('FALSE');
  });

  test('dept_head + supervisor：部门成员与直接下属取并集', async () => {
    const { db, finalQueryConditions } = createScopeDbMock(
      ['dept_head', 'supervisor'],
      {
        departmentRows: [{ id: 'dept-1' }],
        subordinateRows: [{ userId: 'u_sub_cross_dept' }],
        finalRows: [
          { userId: 'u_dept_member' },
          { userId: 'u_sub_cross_dept' },
        ],
      },
    );
    const service = new AccessScopeService(
      db as never,
      {
        getUserRoles: jest.fn().mockResolvedValue(['dept_head', 'supervisor']),
      } as never,
    );

    const ids = await service.getManagedEmployeeIds(callerUserId, {
      includeSelf: false,
    });

    expect(ids).toEqual(['u_dept_member', 'u_sub_cross_dept']);
    const cond = conditionQuery(finalQueryConditions[0]);
    expect(cond).toContain('.user_id =');
    expect(cond).toContain(' IN (');
  });

  test('dept_head 无可负责部门：直接短路为空，不再执行 (FALSE OR FALSE) 查询', async () => {
    const { db, finalQueryConditions } = createScopeDbMock(['dept_head'], {
      departmentRows: [],
      finalRows: [],
    });
    const service = new AccessScopeService(
      db as never,
      { getUserRoles: jest.fn().mockResolvedValue(['dept_head']) } as never,
    );

    const ids = await service.getManagedEmployeeIds(callerUserId, {
      includeSelf: false,
    });

    expect(ids).toEqual([]);
    // 短路：不应触发最终员工范围查询
    expect(finalQueryConditions).toHaveLength(0);
  });

  test('supervisor 无下属：同样短路为空', async () => {
    const { db, finalQueryConditions } = createScopeDbMock(['supervisor'], {
      subordinateRows: [],
      finalRows: [],
    });
    const service = new AccessScopeService(
      db as never,
      { getUserRoles: jest.fn().mockResolvedValue(['supervisor']) } as never,
    );

    const ids = await service.getManagedEmployeeIds(callerUserId, {
      includeSelf: false,
    });

    expect(ids).toEqual([]);
    expect(finalQueryConditions).toHaveLength(0);
  });
});

import {
  AccessScopeService,
  classifyAccessScope,
} from '../../server/common/access/access-scope.service';

describe('classifyAccessScope', () => {
  it('treats admin and hrd as global access', () => {
    expect(classifyAccessScope(['admin'], false, false)).toBe('global');
    expect(classifyAccessScope(['hrd'], false, false)).toBe('global');
  });

  it('treats department heads and supervisors as managed access', () => {
    expect(classifyAccessScope(['dept_head'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], true, false)).toBe('managed');
    expect(classifyAccessScope(['supervisor'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], false, true)).toBe('managed');
  });

  it('falls back to self access for regular employees', () => {
    expect(classifyAccessScope(['employee'], false, false)).toBe('self');
    expect(classifyAccessScope([], false, false)).toBe('self');
  });
});

describe('AccessScopeService', () => {
  it.each([
    {
      label: 'pending',
      employee: {
        status: true,
        deletedAt: null,
        authorizationStatus: 'pending',
      },
    },
    {
      label: 'failed',
      employee: {
        status: true,
        deletedAt: null,
        authorizationStatus: 'failed',
      },
    },
    {
      label: 'inactive',
      employee: {
        status: false,
        deletedAt: null,
        authorizationStatus: 'synced',
      },
    },
    {
      label: 'deleted',
      employee: {
        status: true,
        deletedAt: new Date('2026-07-18T00:00:00Z'),
        authorizationStatus: 'synced',
      },
    },
  ] as const)('fails closed for %s employees', async ({ employee }) => {
    const shouldFailClosed =
      employee.status !== true ||
      employee.deletedAt != null ||
      employee.authorizationStatus !== 'synced';
    expect(shouldFailClosed).toBe(true);

    const db = {
      select: jest.fn(),
    };
    const roleManagerService = {
      hasSynchronizedActiveEmployee: jest.fn().mockResolvedValue(false),
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
    };
    const service = new (AccessScopeService as any)(
      db,
      roleManagerService,
    ) as AccessScopeService;

    await expect(service.getScope('employee-1')).resolves.toEqual({
      kind: 'self',
      roles: [],
      departmentIds: [],
      subordinateIds: [],
    });

    expect(roleManagerService.hasSynchronizedActiveEmployee).toHaveBeenCalledWith(
      'employee-1',
    );
    expect(roleManagerService.getUserRoles).not.toHaveBeenCalled();
  });
});

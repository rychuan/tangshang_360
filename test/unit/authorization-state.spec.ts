import {
  effectiveAuthorizationRoles,
  normalizeAuthorizationRoles,
} from '../../server/modules/role-manager/authorization-state';

describe('authorization state helpers', () => {
  it('normalizes authorization roles', () => {
    expect(normalizeAuthorizationRoles([' admin ', 'employee', 'admin', ''])).toEqual([
      'admin',
      'employee',
    ]);
  });

  it('derives effective authorization roles for active employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: true,
        deletedAt: null,
        authorizationRoles: ['admin'],
      }),
    ).toEqual(['admin']);
  });

  it('returns no effective authorization roles for inactive employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: false,
        deletedAt: null,
        authorizationRoles: ['admin'],
      }),
    ).toEqual([]);
  });

  it('returns no effective authorization roles for deleted employees', () => {
    expect(
      effectiveAuthorizationRoles({
        status: true,
        deletedAt: new Date('2026-07-18T00:00:00Z'),
        authorizationRoles: ['admin'],
      }),
    ).toEqual([]);
  });
});

import type { PermissionItem } from '../../shared/api.interface';
import {
  hasAnyViewPermission,
  hasPermission,
} from '../../client/src/components/permission-policy';

const permissions: PermissionItem[] = [
  { resource: 'employees', actions: ['view'] },
  { resource: 'organization', actions: ['view', 'edit'] },
];

describe('client permission policy', () => {
  it('matches an exact resource action', () => {
    expect(hasPermission(permissions, 'organization', 'edit')).toBe(true);
    expect(hasPermission(permissions, 'employees', 'edit')).toBe(false);
  });

  it('allows a composite page when any view permission matches', () => {
    expect(
      hasAnyViewPermission(permissions, ['employees', 'organization']),
    ).toBe(true);
    expect(hasAnyViewPermission(permissions, ['statistics'])).toBe(false);
  });

  it('fails closed when permissions or requirements are empty', () => {
    expect(hasAnyViewPermission([], ['employees'])).toBe(false);
    expect(hasAnyViewPermission(permissions, [])).toBe(false);
  });
});

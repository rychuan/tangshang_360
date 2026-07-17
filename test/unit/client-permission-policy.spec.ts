import type { PermissionItem } from '../../shared/api.interface';
import {
  COMMAND_PERMISSIONS,
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

  it('requires view access for the requested resource', () => {
    expect(
      hasAnyViewPermission(
        [{ resource: 'statistics', actions: ['edit'] }],
        ['statistics'],
      ),
    ).toBe(false);
  });

  it('fails closed when permissions or requirements are empty', () => {
    expect(hasAnyViewPermission([], ['employees'])).toBe(false);
    expect(hasAnyViewPermission(permissions, [])).toBe(false);
  });

  it('maps commands to the same resource actions used by backend endpoints', () => {
    expect(COMMAND_PERMISSIONS).toMatchObject({
      departmentEdit: { resource: 'organization', action: 'edit' },
      departmentDelete: { resource: 'organization', action: 'delete' },
      dictionaryEdit: { resource: 'dictionary_config', action: 'edit' },
      employeeSync: { resource: 'employees', action: 'edit' },
      employeeBindingEdit: {
        resource: 'employee_binding',
        action: 'edit',
      },
      employeeBindingView: {
        resource: 'employee_binding',
        action: 'view',
      },
    });
  });
});

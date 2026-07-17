import { DEFAULT_PERMISSIONS } from '../../shared/api.interface';
import {
  getDepartmentCommandCapabilities,
  getEmployeeListCapabilities,
  getDefaultEmployeeManagementTab,
  hasEmployeeRowMenuAction,
  getVisibleEmployeeManagementTabs,
} from '../../client/src/pages/EmployeeManagement/employee-management-permissions';

describe('employee management tab permissions', () => {
  it('shows supervisors only the employee list', () => {
    expect(
      getVisibleEmployeeManagementTabs(DEFAULT_PERMISSIONS.supervisor, [
        'supervisor',
      ]),
    ).toEqual(['employees']);
  });

  it('shows department heads employee and department tabs', () => {
    expect(
      getVisibleEmployeeManagementTabs(DEFAULT_PERMISSIONS.dept_head, [
        'dept_head',
      ]),
    ).toEqual(['employees', 'departments']);
  });

  it('shows HRD all currently supported tabs', () => {
    expect(
      getVisibleEmployeeManagementTabs(DEFAULT_PERMISSIONS.hrd, ['hrd']),
    ).toEqual(['employees', 'departments', 'bitable']);
  });

  it('defaults to the first visible tab', () => {
    expect(getDefaultEmployeeManagementTab(['departments'])).toBe(
      'departments',
    );
    expect(getDefaultEmployeeManagementTab([])).toBeNull();
  });

  it('hides the employee row menu when no menu command is allowed', () => {
    expect(
      hasEmployeeRowMenuAction(
        [{ resource: 'employees', actions: ['view'] }],
        ['supervisor'],
      ),
    ).toBe(false);
  });

  it('shows the employee row menu for binding history viewers', () => {
    expect(
      hasEmployeeRowMenuAction(
        [{ resource: 'employee_binding', actions: ['view'] }],
        ['supervisor'],
      ),
    ).toBe(true);
  });

  it('requires both a supported role and permission for mutations', () => {
    const bindingEdit = [
      { resource: 'employee_binding' as const, actions: ['edit' as const] },
    ];

    expect(hasEmployeeRowMenuAction(bindingEdit, ['hrd'])).toBe(true);
    expect(hasEmployeeRowMenuAction(bindingEdit, ['supervisor'])).toBe(false);
  });

  it('loads only employee-scoped reference data for supervisors', () => {
    expect(
      getEmployeeListCapabilities(DEFAULT_PERMISSIONS.supervisor, [
        'supervisor',
      ]),
    ).toEqual({
      loadTemplates: false,
      showBindings: false,
      showSelection: false,
      showActions: false,
    });
  });

  it('loads binding templates and selection controls for binding managers', () => {
    expect(
      getEmployeeListCapabilities(DEFAULT_PERMISSIONS.hrd, ['hrd']),
    ).toEqual({
      loadTemplates: true,
      showBindings: true,
      showSelection: true,
      showActions: true,
    });
  });

  it('combines department roles with dynamic command permissions', () => {
    const permissions = [
      {
        resource: 'organization' as const,
        actions: ['edit', 'delete'] as const,
      },
    ];

    expect(getDepartmentCommandCapabilities(permissions, ['hrd'])).toEqual({
      canEdit: true,
      canDelete: false,
    });
    expect(getDepartmentCommandCapabilities(permissions, ['admin'])).toEqual({
      canEdit: true,
      canDelete: true,
    });
  });
});

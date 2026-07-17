import {
  getDepartmentCommandCapabilities,
  getEmployeeListCapabilities,
  getDefaultEmployeeManagementTab,
  hasEmployeeRowMenuAction,
  getVisibleEmployeeManagementTabs,
} from '../../client/src/pages/EmployeeManagement/employee-management-permissions';

describe('employee management tab permissions', () => {
  it('shows organization viewers only the department tab', () => {
    expect(
      getVisibleEmployeeManagementTabs([
        { resource: 'organization', actions: ['view'] },
      ]),
    ).toEqual(['departments']);
  });

  it('shows employees and bitable tabs for employee viewers', () => {
    expect(
      getVisibleEmployeeManagementTabs([
        { resource: 'employees', actions: ['view'] },
      ]),
    ).toEqual(['employees', 'bitable']);
  });

  it('defaults to the first visible tab', () => {
    expect(getDefaultEmployeeManagementTab(['departments'])).toBe(
      'departments',
    );
    expect(getDefaultEmployeeManagementTab([])).toBeNull();
  });

  it('hides the employee row menu when no menu command is allowed', () => {
    expect(
      hasEmployeeRowMenuAction([{ resource: 'employees', actions: ['view'] }]),
    ).toBe(false);
  });

  it('shows the employee row menu for binding history viewers', () => {
    expect(
      hasEmployeeRowMenuAction([
        { resource: 'employee_binding', actions: ['view'] },
      ]),
    ).toBe(true);
  });

  it('requires only binding edit permission for mutations', () => {
    const bindingEdit = [
      { resource: 'employee_binding' as const, actions: ['edit' as const] },
    ];

    expect(hasEmployeeRowMenuAction(bindingEdit)).toBe(true);
  });

  it('loads only employee-scoped reference data when binding edit is missing', () => {
    expect(
      getEmployeeListCapabilities([
        { resource: 'employees', actions: ['view'] },
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
      getEmployeeListCapabilities([
        { resource: 'employees', actions: ['view', 'edit'] },
        { resource: 'employee_binding', actions: ['view', 'edit'] },
      ]),
    ).toEqual({
      loadTemplates: true,
      showBindings: true,
      showSelection: true,
      showActions: true,
    });
  });

  it('uses organization permissions for department commands', () => {
    const permissions = [
      {
        resource: 'organization' as const,
        actions: ['view', 'delete'] as const,
      },
    ];

    expect(getDepartmentCommandCapabilities(permissions)).toEqual({
      canEdit: false,
      canDelete: true,
    });
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  canManageDepartmentHead,
  getDepartmentCommandCapabilities,
  getEmployeeListCapabilities,
  getDefaultEmployeeManagementTab,
  hasEmployeeRowMenuAction,
  getVisibleEmployeeManagementTabs,
} from '../../client/src/pages/EmployeeManagement/employee-management-permissions';

describe('employee management tab permissions', () => {
  it('hides the department tab from organization viewers without an allowed identity role', () => {
    expect(
      getVisibleEmployeeManagementTabs([
        { resource: 'organization', actions: ['view'] },
      ], ['custom-role']),
    ).toEqual([]);
  });

  it('shows the department tab to department heads with organization view permission', () => {
    expect(
      getVisibleEmployeeManagementTabs(
        [{ resource: 'organization', actions: ['view'] }],
        ['dept_head'],
      ),
    ).toEqual(['departments']);
  });

  it('keeps the employee tab permission-only while hiding Bitable from non-global identities', () => {
    expect(
      getVisibleEmployeeManagementTabs([
        { resource: 'employees', actions: ['view'] },
      ], ['supervisor']),
    ).toEqual(['employees']);
  });

  it('shows Bitable only to global identities with the employee view permission', () => {
    expect(
      getVisibleEmployeeManagementTabs(
        [{ resource: 'employees', actions: ['view'] }],
        ['hrd'],
      ),
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

  it('allows department head selection only for built-in admins with permission-management edit', () => {
    const permissionEdit = [
      {
        resource: 'permission_management' as const,
        actions: ['edit' as const],
      },
    ];

    expect(canManageDepartmentHead(permissionEdit, ['admin'])).toBe(true);
    expect(canManageDepartmentHead(permissionEdit, ['hrd'])).toBe(false);
    expect(canManageDepartmentHead([], ['admin'])).toBe(false);
  });

  it('passes current identity roles into tab visibility and gates the head selector', () => {
    const pageSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx',
      ),
      'utf8',
    );
    const departmentSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../client/src/pages/EmployeeManagement/DepartmentManagementTab.tsx',
      ),
      'utf8',
    );

    expect(pageSource).toMatch(
      /getVisibleEmployeeManagementTabs\(\s*permissions,\s*identityRoles\s*\)/,
    );
    expect(departmentSource).toContain(
      'canManageDepartmentHead(permissions, identityRoles)',
    );
    expect(departmentSource).toMatch(
      /\{canManageHead && \(\s*<div>\s*<Label>部门负责人<\/Label>/,
    );
  });
});

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
  const visibleTabs = (
    permissions: Parameters<typeof getVisibleEmployeeManagementTabs>[0],
    canManageGlobalConnections: boolean,
  ) =>
    (getVisibleEmployeeManagementTabs as any)(
      permissions,
      canManageGlobalConnections,
    );

  it('shows the department tab to matching custom-role permissions', () => {
    expect(
      visibleTabs([{ resource: 'organization', actions: ['view'] }], false),
    ).toEqual(['departments']);
  });

  it('keeps self-scoped custom employee viewers on the employee tab only', () => {
    expect(
      visibleTabs([{ resource: 'employees', actions: ['view'] }], false),
    ).toEqual(['employees']);
  });

  it('hides every tab when no matching dynamic view permission exists', () => {
    expect(visibleTabs([], false)).toEqual([]);
  });

  it('keeps the existing admin permission-matrix behavior', () => {
    expect(
      visibleTabs(
        [
          { resource: 'employees', actions: ['view'] },
          { resource: 'organization', actions: ['view'] },
        ],
        true,
      ),
    ).toEqual(['employees', 'departments']);
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

  it('uses permission-first visibility while retaining the admin-only head selector', () => {
    const pageSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../client/src/pages/EmployeeManagement/EmployeeManagementPage.tsx',
      ),
      'utf8',
    );
    const treePanelSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../client/src/pages/EmployeeManagement/DepartmentTreePanel.tsx',
      ),
      'utf8',
    );
    const permissionsHookSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/hooks/usePermissions.tsx'),
      'utf8',
    );
    const employeeApiSource = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/api/employee-management.ts'),
      'utf8',
    );

    // 页面按权限决定渲染：员工列表（employees view）+ 部门树（organization view）
    expect(pageSource).toContain(
      "p.resource === 'employees' && p.actions.includes('view')",
    );
    expect(pageSource).toContain(
      "hasPermission(permissions, 'organization', 'view')",
    );
    expect(pageSource).not.toContain('identityRoles');
    expect(pageSource).not.toContain('BUILTIN_ROLE_CODES');
    expect(pageSource).not.toContain('ROLE_SUBJECT');
    expect(pageSource).not.toContain('useAuth');
    expect(permissionsHookSource).toMatch(
      /employeeManagement\s*\.getMyPermissions\(\)/,
    );
    expect(employeeApiSource).toContain("url: '/api/employees/my/permissions'");
    // 部门 CRUD 与负责人设置集中在部门树面板，且保留身份+权限双重门槛
    expect(treePanelSource).toContain(
      'canCreateDepartment(permissions, identityRoles)',
    );
    expect(treePanelSource).toContain(
      'canManageDepartmentHead(permissions, identityRoles)',
    );
    expect(treePanelSource).toContain(
      'getDepartmentCommandCapabilities(permissions)',
    );
    expect(treePanelSource).toMatch(
      /\{canManageHead && \(\s*<div[\s\S]*<Label className="text-xs">部门负责人<\/Label>/,
    );
  });
});

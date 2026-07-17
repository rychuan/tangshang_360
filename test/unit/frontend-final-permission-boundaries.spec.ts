import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMMAND_PERMISSIONS } from '../../client/src/components/permission-policy';

function readClient(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../client/src', relativePath),
    'utf8',
  );
}

describe('frontend final permission boundaries', () => {
  it('defines command permissions for assessment viewing, scoring, and sync logs', () => {
    expect(COMMAND_PERMISSIONS).toMatchObject({
      assessmentView: { resource: 'my_assessments', action: 'view' },
      assessmentEdit: { resource: 'my_assessments', action: 'edit' },
      employeeSyncLog: { resource: 'employees', action: 'view' },
    });
  });

  it('requires admin identity and permission_management edit before rendering role selection', () => {
    const dialogSource = readClient(
      'pages/EmployeeManagement/EmployeeFormDialog.tsx',
    );
    const listSource = readClient(
      'pages/EmployeeManagement/EmployeeListTab.tsx',
    );

    expect(dialogSource).toMatch(
      /canManageRoles[\s\S]*canManageRoles\s*&&\s*\([\s\S]*角色/,
    );
    expect(listSource).toContain("ability.can('admin', ROLE_SUBJECT)");
    expect(listSource).toContain(
      "hasPermission(permissions, 'permission_management', 'edit')",
    );
    expect(listSource).toMatch(
      /<EmployeeFormDialog[\s\S]*canManageRoles=\{canManageRoles\}/,
    );
  });

  it('uses my_assessments permissions for statistics and team assessment commands', () => {
    const statisticsSource = readClient('pages/Statistics/StatisticsPage.tsx');
    const teamSource = readClient(
      'pages/TeamPerformance/TeamPerformancePage.tsx',
    );
    const assessmentDetailSource = readClient(
      'pages/AssessmentDetail/useAssessmentDetail.ts',
    );

    expect(statisticsSource).toMatch(
      /<CanDo \{\.\.\.COMMAND_PERMISSIONS\.assessmentView\}>[\s\S]*navigate\(`\.\.\/assessment\/\$\{r\.id\}`\)/,
    );
    expect(teamSource).toContain(
      'COMMAND_PERMISSIONS.assessmentView',
    );
    expect(assessmentDetailSource).toContain(
      "usePermission('my_assessments', 'edit')",
    );
  });

  it('uses employees edit for Bitable mutations and employees view for logs', () => {
    const source = readClient(
      'pages/EmployeeManagement/BitableConnectionTab.tsx',
    );
    const permissionBefore = (needle: string) => {
      const commandIndex = source.indexOf(needle);
      expect(commandIndex).toBeGreaterThan(-1);
      const wrapperIndex = source.lastIndexOf('<CanDo', commandIndex);
      return source.slice(wrapperIndex, commandIndex);
    };

    expect(permissionBefore('onClick={() => handleImport(conn)}')).toContain(
      'COMMAND_PERMISSIONS.employeeSync',
    );
    expect(permissionBefore('onClick={() => handleExport(conn)}')).toContain(
      'COMMAND_PERMISSIONS.employeeSync',
    );
    expect(permissionBefore('setEditing(conn)')).toContain(
      'COMMAND_PERMISSIONS.employeeSync',
    );
    expect(permissionBefore('setDeleteTarget(conn)')).toContain(
      'COMMAND_PERMISSIONS.employeeSync',
    );
    expect(permissionBefore('setLogDrawer({')).toContain(
      'COMMAND_PERMISSIONS.employeeSyncLog',
    );
  });

  it('guards both top-level and inline department creation by global identity', () => {
    const source = readClient(
      'pages/EmployeeManagement/DepartmentManagementTab.tsx',
    );
    const policySource = readClient(
      'pages/EmployeeManagement/employee-management-permissions.ts',
    );

    expect(policySource).toContain('canCreateDepartment');
    expect(source).toMatch(
      /canCreateDepartment\(permissions, identityRoles\)/,
    );
    expect(source).toMatch(
      /canCreateDepartment\(permissions, identityRoles\)[\s\S]*新建部门/,
    );
    expect(source).toMatch(
      /canCreateDepartment\(permissions, identityRoles\)[\s\S]*ActionBadge[\s\S]*actionType="bind"/,
    );
    expect(source).toContain('getDepartmentCommandCapabilities(permissions)');
  });
});

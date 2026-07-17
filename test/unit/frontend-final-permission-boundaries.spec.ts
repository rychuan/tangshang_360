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

  it('uses employees view for the Bitable sync-log command', () => {
    const source = readClient(
      'pages/EmployeeManagement/BitableConnectionTab.tsx',
    );

    expect(source).toMatch(
      /<CanDo \{\.\.\.COMMAND_PERMISSIONS\.employeeSyncLog\}>[\s\S]*title="同步日志"/,
    );
  });
});

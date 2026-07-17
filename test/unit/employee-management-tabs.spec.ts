import { DEFAULT_PERMISSIONS } from '../../shared/api.interface';
import {
  getDefaultEmployeeManagementTab,
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
});

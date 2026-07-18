import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PERMISSIONS } from '../../shared/api.interface';

let mockRoles: string[] = [];
let mockAuthLoading = false;
let mockPermissions = DEFAULT_PERMISSIONS.employee;
let mockPermissionsLoading = false;
let mockCanManageGlobalConnections = false;

jest.mock('@lark-apaas/client-toolkit/auth', () => ({
  ROLE_SUBJECT: 'role',
  useAuth: () => ({
    ability: {
      can: (role: string) => mockRoles.includes(role),
    },
    isLoading: mockAuthLoading,
  }),
  CanRole: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    permissions: mockPermissions,
    loading: mockPermissionsLoading,
    canManageGlobalConnections: mockCanManageGlobalConnections,
  }),
}));

jest.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) =>
    React.createElement('span', { 'data-navigate': to }),
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  TabsList: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  TabsTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', null, children),
  TabsContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('section', null, children),
}));

jest.mock('@/components/business-ui/page-header', () => ({
  PageHeader: () => React.createElement('header', null, '员工管理'),
}));

jest.mock('../../client/src/pages/EmployeeManagement/EmployeeListTab', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-tab': 'employees' }),
}));
jest.mock(
  '../../client/src/pages/EmployeeManagement/DepartmentManagementTab',
  () => ({
    __esModule: true,
    default: () => React.createElement('div', { 'data-tab': 'departments' }),
  }),
);
jest.mock(
  '../../client/src/pages/EmployeeManagement/BitableConnectionTab',
  () => ({
    __esModule: true,
    default: () => React.createElement('div', { 'data-tab': 'bitable' }),
  }),
);

import ProtectedRoute from '../../client/src/components/ProtectedRoute';
import EmployeeManagementPage from '../../client/src/pages/EmployeeManagement/EmployeeManagementPage';

describe('client permission component wiring', () => {
  beforeEach(() => {
    mockRoles = [];
    mockAuthLoading = false;
    mockPermissions = DEFAULT_PERMISSIONS.employee;
    mockPermissionsLoading = false;
    mockCanManageGlobalConnections = false;
  });

  it('does not mount a protected page while permissions are loading', () => {
    mockRoles = ['employee'];
    mockPermissionsLoading = true;

    const html = renderToStaticMarkup(
      React.createElement(
        ProtectedRoute,
        { resources: ['dashboard'] },
        React.createElement('span', { 'data-page': 'child' }),
      ),
    );

    expect(html).toContain('加载中');
    expect(html).not.toContain('data-page="child"');
  });

  it('redirects a matching role when resource view permission is denied', () => {
    mockRoles = ['employee'];
    mockPermissions = [];

    const html = renderToStaticMarkup(
      React.createElement(
        ProtectedRoute,
        { resources: ['dashboard'] },
        React.createElement('span', { 'data-page': 'child' }),
      ),
    );

    expect(html).toContain('data-navigate="/403"');
    expect(html).not.toContain('data-page="child"');
  });

  it('mounts a protected page when resource view matches', () => {
    mockRoles = [];
    mockPermissions = [{ resource: 'dashboard', actions: ['view'] }];

    const html = renderToStaticMarkup(
      React.createElement(
        ProtectedRoute,
        { resources: ['dashboard'] },
        React.createElement('span', { 'data-page': 'child' }),
      ),
    );

    expect(html).toContain('data-page="child"');
    expect(html).not.toContain('data-navigate');
  });

  it('allows an unknown custom role when resource permission matches', () => {
    mockRoles = [];
    mockPermissions = [{ resource: 'statistics', actions: ['view'] }];

    const html = renderToStaticMarkup(
      React.createElement(
        ProtectedRoute,
        { resources: ['statistics'] },
        React.createElement('span', { 'data-page': 'custom-role' }),
      ),
    );

    expect(html).toContain('data-page="custom-role"');
  });

  it('retains explicit identity-role restrictions', () => {
    mockRoles = [];
    mockPermissions = [
      { resource: 'permission_management', actions: ['view'] },
    ];

    const html = renderToStaticMarkup(
      React.createElement(
        ProtectedRoute,
        {
          resources: ['permission_management'],
          identityRoles: ['admin', 'hrd'],
        },
        React.createElement('span', { 'data-page': 'permissions' }),
      ),
    );

    expect(html).toContain('data-navigate="/403"');
  });

  it('mounts only the employee tab for a non-global employee viewer', () => {
    mockRoles = ['supervisor'];
    mockPermissions = DEFAULT_PERMISSIONS.supervisor;

    const html = renderToStaticMarkup(
      React.createElement(EmployeeManagementPage),
    );

    expect(html).toContain('data-tab="employees"');
    expect(html).not.toContain('data-tab="departments"');
    expect(html).not.toContain('data-tab="bitable"');
  });

  it('mounts employee, department, and Bitable tabs for a global viewer', () => {
    mockRoles = ['hrd'];
    mockPermissions = DEFAULT_PERMISSIONS.hrd;
    mockCanManageGlobalConnections = true;

    const html = renderToStaticMarkup(
      React.createElement(EmployeeManagementPage),
    );

    expect(html).toContain('data-tab="employees"');
    expect(html).toContain('data-tab="departments"');
    expect(html).toContain('data-tab="bitable"');
  });

  it('mounts only the organization tab when employees view is absent', () => {
    mockRoles = ['dept_head'];
    mockPermissions = [{ resource: 'organization', actions: ['view'] }];

    const html = renderToStaticMarkup(
      React.createElement(EmployeeManagementPage),
    );

    expect(html).not.toContain('data-tab="employees"');
    expect(html).toContain('data-tab="departments"');
    expect(html).not.toContain('data-tab="bitable"');
  });

  it('does not mount Bitable for a self-scoped custom employee viewer', () => {
    mockRoles = [];
    mockPermissions = [{ resource: 'employees', actions: ['view'] }];
    mockCanManageGlobalConnections = false;

    const html = renderToStaticMarkup(
      React.createElement(EmployeeManagementPage),
    );

    expect(html).toContain('data-tab="employees"');
    expect(html).not.toContain('data-tab="bitable"');
  });
});

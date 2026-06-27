import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@lark-apaas/client-toolkit/auth';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import NotFound from './pages/NotFound/NotFound';
import HomePage from './pages/HomePage/HomePage';
import TemplateManagementPage from './pages/TemplateManagement/TemplateManagementPage';
import PublishManagementPage from './pages/PublishManagement/PublishManagementPage';
import AssessmentDetailPage from './pages/AssessmentDetail/AssessmentDetailPage';
import StatisticsPage from './pages/Statistics/StatisticsPage';
import MyAssessmentsPage from './pages/MyAssessments/MyAssessmentsPage';
import TeamPerformancePage from './pages/TeamPerformance/TeamPerformancePage';
import EmployeeManagementPage from './pages/EmployeeManagement/EmployeeManagementPage';
import EmployeeDetailPage from './pages/EmployeeManagement/EmployeeDetailPage';
import PermissionPage from './pages/EmployeeManagement/PermissionPage';
import GradeConfigPage from './pages/GradeConfig/GradeConfigPage';
import DictionaryConfigPage from './pages/DictionaryConfig/DictionaryConfigPage';

const ALL_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor', 'employee'];
const MANAGER_ROLES = ['admin', 'hrd', 'dept_head', 'supervisor'];
const TEMPLATE_ROLES = ['admin', 'hrd', 'dept_head'];
const ADMIN_HRD_ROLES = ['admin', 'hrd'];

const ForbiddenPage: React.FC = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="text-center">
      <h1 className="text-2xl font-bold text-muted-foreground">403</h1>
      <p className="mt-2 text-sm text-muted-foreground">您没有权限访问此页面</p>
    </div>
  </div>
);

const getPermissionApiUrl = (): string => {
  const w = window as any;
  let appId = w.appId || '';
  if (!appId) {
    const basePath = process.env.CLIENT_BASE_PATH || '';
    const match = basePath.match(/\/app\/([^/]+)/);
    if (match) appId = match[1];
  }
  if (!appId) {
    const pathMatch = window.location.pathname.match(/\/app\/([^/]+)/);
    if (pathMatch) appId = pathMatch[1];
  }
  return `/app/${appId}/api/role_manager/my-roles`;
};

const RoutesComponent = () => {
  return (
    <AuthProvider config={{ permissionApi: { url: getPermissionApiUrl() } }}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <ProtectedRoute roles={ALL_ROLES}>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="template-management"
            element={
              <ProtectedRoute roles={TEMPLATE_ROLES}>
                <TemplateManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="publish-management"
            element={
              <ProtectedRoute roles={MANAGER_ROLES}>
                <PublishManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="assessment/:id"
            element={
              <ProtectedRoute roles={ALL_ROLES}>
                <AssessmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="statistics"
            element={
              <ProtectedRoute roles={MANAGER_ROLES}>
                <StatisticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="my-assessments"
            element={
              <ProtectedRoute roles={ALL_ROLES}>
                <MyAssessmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="team-performance"
            element={
              <ProtectedRoute roles={MANAGER_ROLES}>
                <TeamPerformancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="employees"
            element={
              <ProtectedRoute roles={MANAGER_ROLES}>
                <EmployeeManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="employees/:id"
            element={
              <ProtectedRoute roles={MANAGER_ROLES}>
                <EmployeeDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="permissions"
            element={
              <ProtectedRoute roles={ADMIN_HRD_ROLES}>
                <PermissionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="grade-config"
            element={
              <ProtectedRoute roles={ADMIN_HRD_ROLES}>
                <GradeConfigPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="dictionary"
            element={
              <ProtectedRoute roles={ADMIN_HRD_ROLES}>
                <DictionaryConfigPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="dictionary/:type"
            element={
              <ProtectedRoute roles={ADMIN_HRD_ROLES}>
                <DictionaryConfigPage />
              </ProtectedRoute>
            }
          />
          <Route path="403" element={<ForbiddenPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
};

export default RoutesComponent;

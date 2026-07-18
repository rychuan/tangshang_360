import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@lark-apaas/client-toolkit/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { DefaultLandingRoute } from './components/app-shell/DefaultLandingRoute';
import { PermissionsProvider } from './hooks/usePermissions';
import NotFound from './pages/NotFound/NotFound';
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
import HomePage from './pages/HomePage/HomePage';
import MobileSignPage from './pages/MobileSign/MobileSignPage';

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider config={{ permissionApi: { url: getPermissionApiUrl() } }}>
        <PermissionsProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DefaultLandingRoute />} />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute resources={['dashboard']}>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="template-management"
                element={
                  <ProtectedRoute
                    resources={['template_management']}
                  >
                    <TemplateManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="publish-management"
                element={
                  <ProtectedRoute resources={['publish_management']}>
                    <PublishManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="assessment/:id"
                element={
                  <ProtectedRoute resources={['my_assessments']}>
                    <AssessmentDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="statistics"
                element={
                  <ProtectedRoute resources={['statistics']}>
                    <StatisticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-assessments"
                element={
                  <ProtectedRoute resources={['my_assessments']}>
                    <MyAssessmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="team-performance"
                element={
                  <ProtectedRoute resources={['team_performance']}>
                    <TeamPerformancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employees"
                element={
                  <ProtectedRoute resources={['employees', 'organization']}>
                    <EmployeeManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employees/:id"
                element={
                  <ProtectedRoute resources={['employees']}>
                    <EmployeeDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="permissions"
                element={
                  <ProtectedRoute
                    resources={['permission_management']}
                    identityRoles={['admin', 'hrd']}
                  >
                    <PermissionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="grade-config"
                element={
                  <ProtectedRoute resources={['grade_config']}>
                    <GradeConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dictionary"
                element={
                  <ProtectedRoute resources={['dictionary_config']}>
                    <DictionaryConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="dictionary/:type"
                element={
                  <ProtectedRoute resources={['dictionary_config']}>
                    <DictionaryConfigPage />
                  </ProtectedRoute>
                }
              />
              <Route path="403" element={<ForbiddenPage />} />
            </Route>
            <Route path="mobile-sign" element={<MobileSignPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default RoutesComponent;

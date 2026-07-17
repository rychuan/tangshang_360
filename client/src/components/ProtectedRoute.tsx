import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import type { PermissionResource } from '@shared/api.interface';
import { usePermissions } from '@/hooks/usePermissions';
import { hasAnyViewPermission } from './permission-policy';

interface ProtectedRouteProps {
  resources?: PermissionResource[];
  identityRoles?: string[];
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  resources,
  identityRoles,
  children,
}) => {
  const { ability, isLoading } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();

  if (isLoading || permissionsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!ability) {
    return <Navigate to="/403" replace />;
  }

  const hasResourceAccess =
    !resources || hasAnyViewPermission(permissions, resources);
  const hasIdentityAccess =
    !identityRoles || identityRoles.some((r) => ability.can(r, ROLE_SUBJECT));

  if (!hasIdentityAccess || !hasResourceAccess) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';

interface ProtectedRouteProps {
  roles: string[];
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ roles, children }) => {
  const { ability, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const hasAccess = roles.some(r => ability.can(r, ROLE_SUBJECT));

  if (!hasAccess) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

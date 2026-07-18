import { ROLE_SUBJECT, useAuth } from '@lark-apaas/client-toolkit/auth';
import { Navigate } from 'react-router-dom';
import { navGroups } from '@/components/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import {
  filterVisibleNavGroups,
  getDefaultLandingPath,
} from './app-shell-utils';

export function DefaultLandingRoute() {
  const { ability, isLoading } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();

  if (isLoading || permissionsLoading) return null;

  const visibleGroups = filterVisibleNavGroups({
    groups: navGroups,
    canRole: (role) => ability.can(role, ROLE_SUBJECT),
    permissions,
  });

  return <Navigate to={getDefaultLandingPath(visibleGroups)} replace />;
}

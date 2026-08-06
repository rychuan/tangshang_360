import { useState, useEffect } from 'react';
import { ROLE_SUBJECT, useAuth } from '@lark-apaas/client-toolkit/auth';
import { Navigate } from 'react-router-dom';
import { navGroups } from '@/components/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { bootstrapAdmin } from '@/api/role-manager';
import {
  filterVisibleNavGroups,
  getDefaultLandingPath,
} from './app-shell-utils';

export function DefaultLandingRoute() {
  const { ability, isLoading } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);

  const loading = isLoading || permissionsLoading;

  const landingPath = loading
    ? null
    : getDefaultLandingPath(
        filterVisibleNavGroups({
          groups: navGroups,
          canRole: (role) => ability.can(role, ROLE_SUBJECT),
          permissions,
        }),
      );

  useEffect(() => {
    if (landingPath !== '/403' || bootstrapping || bootstrapFailed) return;
    setBootstrapping(true);
    bootstrapAdmin()
      .then(() => window.location.reload())
      .catch(() => {
        setBootstrapping(false);
        setBootstrapFailed(true);
      });
  }, [landingPath, bootstrapping, bootstrapFailed]);

  if (loading || (landingPath === '/403' && bootstrapping)) return null;
  return <Navigate to={landingPath ?? '/403'} replace />;
}

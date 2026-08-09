import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  CurrentUserAuthorizationContext,
  PermissionItem,
  PermissionResource,
  PermissionAction,
} from '@shared/api.interface';
import { employeeManagement } from '@/api';

interface PermissionsContextValue extends CurrentUserAuthorizationContext {
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: [],
  accessScopeKind: 'self',
  loading: true,
});

export function PermissionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorization, setAuthorization] =
    useState<CurrentUserAuthorizationContext>({
      permissions: [],
      accessScopeKind: 'self',
    });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    employeeManagement
      .getMyPermissions()
      .then(setAuthorization)
      .catch(() =>
        setAuthorization({
          permissions: [],
          accessScopeKind: 'self',
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <PermissionsContext.Provider value={{ ...authorization, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}

export function usePermission(
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const { permissions } = useContext(PermissionsContext);
  return permissions.some(
    (item) => item.resource === resource && item.actions.includes(action),
  );
}

interface CanDoProps {
  resource: PermissionResource;
  action: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function CanDo({
  resource,
  action,
  children,
  fallback = null,
}: CanDoProps) {
  const allowed = usePermission(resource, action);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

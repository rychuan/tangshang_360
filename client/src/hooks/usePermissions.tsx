import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  PermissionItem,
  PermissionResource,
  PermissionAction,
} from '@shared/api.interface';
import { roleManager } from '@/api';

interface PermissionsContextValue {
  permissions: PermissionItem[];
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: [],
  loading: true,
});

export function PermissionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    roleManager
      .getMyPermissions()
      .then(setPermissions)
      .catch(() => setPermissions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, loading }}>
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

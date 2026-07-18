export type AuthorizationStatus = 'pending' | 'synced' | 'failed';

export interface AuthorizationStateEmployee {
  status: boolean;
  deletedAt: Date | string | null;
  authorizationRoles: string[] | null | undefined;
}

export function normalizeAuthorizationRoles(roles: string[]): string[] {
  return Array.from(
    new Set(
      roles
        .map((role) => role.trim())
        .filter((role) => role.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function effectiveAuthorizationRoles(
  employee: AuthorizationStateEmployee,
): string[] {
  if (!employee.status || employee.deletedAt != null) {
    return [];
  }

  return normalizeAuthorizationRoles(employee.authorizationRoles ?? []);
}

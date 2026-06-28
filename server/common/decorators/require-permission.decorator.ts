import { SetMetadata } from '@nestjs/common';
import type {
  PermissionResource,
  PermissionAction,
} from '@shared/api.interface';

export const PERMISSION_META_KEY = 'required_permission';

export interface RequiredPermission {
  resource: PermissionResource;
  action: PermissionAction;
}

export const RequirePermission = (
  resource: PermissionResource,
  action: PermissionAction,
) => SetMetadata(PERMISSION_META_KEY, { resource, action });

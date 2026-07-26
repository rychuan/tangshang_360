import type {
  MemberMutationData,
  FilterParams,
} from '@lark-apaas/fullstack-nestjs-core';

export type PermissionAction =
  | 'view'
  | 'edit'
  | 'delete'
  | 'export'
  | 'publish';

export type PermissionResource =
  | 'dashboard'
  | 'my_assessments'
  | 'employees'
  | 'template_management'
  | 'organization'
  | 'employee_binding'
  | 'publish_management'
  | 'statistics'
  | 'team_performance'
  | 'permission_management'
  | 'grade_config'
  | 'dictionary_config';

export interface PermissionItem {
  resource: PermissionResource;
  actions: PermissionAction[];
}

export interface CurrentUserAuthorizationContext {
  permissions: PermissionItem[];
  accessScopeKind: 'global' | 'managed' | 'self';
  canManageGlobalConnections: boolean;
}

const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  'view',
  'edit',
  'delete',
  'export',
  'publish',
];

export const PERMISSION_MATRIX: Record<
  PermissionResource,
  readonly PermissionAction[]
> = {
  dashboard: ['view'],
  my_assessments: ['view', 'edit'],
  employees: ['view', 'edit', 'delete'],
  template_management: ['view', 'edit', 'delete'],
  organization: ['view', 'edit', 'delete'],
  employee_binding: ['view', 'edit'],
  publish_management: ['view', 'edit', 'export', 'publish'],
  statistics: ['view', 'export'],
  team_performance: ['view', 'edit'],
  permission_management: ['view', 'edit'],
  grade_config: ['view', 'edit'],
  dictionary_config: ['view', 'edit'],
};

export const DEFAULT_PERMISSIONS: Record<string, PermissionItem[]> = {
  admin: [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'my_assessments', actions: ['view', 'edit'] },
    { resource: 'employees', actions: ['view', 'edit', 'delete'] },
    { resource: 'template_management', actions: ['view', 'edit', 'delete'] },
    { resource: 'employee_binding', actions: ['view', 'edit'] },
    {
      resource: 'publish_management',
      actions: ['view', 'edit', 'export', 'publish'],
    },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'team_performance', actions: ['view', 'edit'] },
    { resource: 'organization', actions: ['view', 'edit', 'delete'] },
    { resource: 'permission_management', actions: ['view', 'edit'] },
    { resource: 'grade_config', actions: ['view', 'edit'] },
    { resource: 'dictionary_config', actions: ['view', 'edit'] },
  ],
  hrd: [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'my_assessments', actions: ['view'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'template_management', actions: ['view', 'edit', 'delete'] },
    { resource: 'employee_binding', actions: ['view', 'edit'] },
    {
      resource: 'publish_management',
      actions: ['view', 'edit', 'export', 'publish'],
    },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'team_performance', actions: ['view'] },
    { resource: 'organization', actions: ['view', 'edit'] },
    { resource: 'permission_management', actions: ['view'] },
    { resource: 'grade_config', actions: ['view', 'edit'] },
    { resource: 'dictionary_config', actions: ['view', 'edit'] },
  ],
  dept_head: [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'my_assessments', actions: ['view'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'template_management', actions: ['view'] },
    { resource: 'employee_binding', actions: ['view'] },
    { resource: 'publish_management', actions: ['view', 'export'] },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'organization', actions: ['view', 'edit'] },
    { resource: 'team_performance', actions: ['view', 'edit'] },
  ],
  supervisor: [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'my_assessments', actions: ['view', 'edit'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'statistics', actions: ['view'] },
    { resource: 'team_performance', actions: ['view', 'edit'] },
  ],
  employee: [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'my_assessments', actions: ['view', 'edit'] },
  ],
};

export type {
  ForceRoleDTO,
  RoleMemberDTO,
  MemberMutationData,
  MemberType,
  UserSimpleDTO,
  DepartmentDTO,
  ChatSimpleDTO,
  PresetGroupDTO,
  SearchResponse,
  SearchResult,
  FilterParams,
  I18nText,
  ListMembersResponse,
  CreateRoleResponse,
} from '@lark-apaas/fullstack-nestjs-core';

export interface CreateRoleRequest {
  role: { name: string; description?: string; bizID: string };
}

export interface UpdateRoleRequest {
  role: { name?: string; description?: string };
}

export interface AddMembersRequest {
  members: import('@lark-apaas/fullstack-nestjs-core').MemberMutationData;
}

export interface RemoveMembersRequest {
  members: import('@lark-apaas/fullstack-nestjs-core').MemberMutationData;
}

export interface SearchMembersRequest {
  query: string;
  filters?: import('@lark-apaas/fullstack-nestjs-core').FilterParams;
  pageSize?: number;
  page?: number;
}

export interface RolePermissionConfig {
  roleBizId: string;
  permissions: PermissionItem[];
}

export interface UpdateRolePermissionsRequest {
  permissions: PermissionItem[];
}

export type RoleMemberMutationOutcomeStatus =
  | 'synced'
  | 'unchanged'
  | 'failed'
  | 'superseded'
  | 'not_processable'
  | 'stale_owner';

export interface RoleMemberMutationOutcome {
  userId: string;
  status: RoleMemberMutationOutcomeStatus;
  version?: number;
  error?: string;
}

export interface RoleMemberMutationResponse {
  success: boolean;
  outcomes: RoleMemberMutationOutcome[];
}

export interface RoleMemberMutationErrorDetails extends RoleMemberMutationResponse {
  message: string;
  success: false;
}

export const BUILTIN_ROLE_CODES = [
  'admin',
  'hrd',
  'dept_head',
  'supervisor',
  'employee',
] as const;

export function isBuiltinRole(roleBizId: string): boolean {
  return (BUILTIN_ROLE_CODES as readonly string[]).includes(roleBizId);
}

export function normalizePermissionConfig(
  roleBizId: string,
  permissions: unknown,
): PermissionItem[] {
  if (!Array.isArray(permissions)) {
    throw new Error('权限配置必须是数组');
  }

  const knownResources = new Set<string>(Object.keys(PERMISSION_MATRIX));
  const merged = new Map<PermissionResource, Set<PermissionAction>>();

  for (const item of permissions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('权限配置项格式无效');
    }

    const resource = (item as { resource?: unknown }).resource;
    const actions = (item as { actions?: unknown }).actions;
    if (typeof resource !== 'string') {
      throw new Error(`未知权限资源: ${String(resource)}`);
    }

    if (resource === '*') {
      for (const res of Object.keys(PERMISSION_MATRIX) as PermissionResource[]) {
        const set =
          merged.get(res) ?? new Set<PermissionAction>();
        for (const act of PERMISSION_MATRIX[res]) {
          set.add(act);
        }
        merged.set(res, set);
      }
      continue;
    }

    if (!knownResources.has(resource)) {
      throw new Error(`未知权限资源: ${String(resource)}`);
    }
    if (!Array.isArray(actions)) {
      throw new Error(`权限资源 ${resource} 的操作必须是数组`);
    }

    const actionSet =
      merged.get(resource as PermissionResource) ?? new Set<PermissionAction>();
    const allowedActions = PERMISSION_MATRIX[resource as PermissionResource];
    for (const action of actions) {
      if (action === '*') {
        for (const act of allowedActions) {
          actionSet.add(act);
        }
        continue;
      }
      if (
        typeof action !== 'string' ||
        !allowedActions.includes(action as PermissionAction)
      ) {
        throw new Error(`权限资源 ${resource} 不支持操作: ${String(action)}`);
      }
      actionSet.add(action as PermissionAction);
    }
    merged.set(resource as PermissionResource, actionSet);
  }

  if (roleBizId === 'admin') {
    const permissionManagement = merged.get('permission_management');
    if (
      !permissionManagement?.has('view') ||
      !permissionManagement.has('edit')
    ) {
      throw new Error('系统管理员必须保留权限管理的查看和编辑权限');
    }
  }

  return Array.from(merged.entries())
    .filter(([, actions]) => actions.size > 0)
    .map(([resource, actions]) => {
      if (
        Array.from(actions).some((action) => action !== 'view') &&
        !actions.has('view')
      ) {
        actions.add('view');
      }
      return {
        resource,
        actions: PERMISSION_ACTIONS.filter((action) => actions.has(action)),
      };
    });
}

export const ROLE_OPTIONS = [
  'admin',
  'hrd',
  'dept_head',
  'supervisor',
  'employee',
] as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  hrd: '人力资源总监',
  dept_head: '部门负责人',
  supervisor: '直属上级',
  employee: '普通员工',
};

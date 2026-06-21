import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateRoleRequest,
  UpdateRoleRequest,
  AddMembersRequest,
  RemoveMembersRequest,
  SearchMembersRequest,
  RolePermissionConfig,
  UpdateRolePermissionsRequest,
  ForceRoleDTO,
  ListMembersResponse,
  SearchResponse,
} from '@shared/api.interface';

export async function listRoles(): Promise<ForceRoleDTO[]> {
  const { data } = await axiosForBackend({
    url: '/api/role_manager/roles',
    method: 'GET',
  });
  return data;
}

export async function getRole(bizID: string): Promise<ForceRoleDTO> {
  const { data } = await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}`,
    method: 'GET',
  });
  return data;
}

export async function createRole(dto: CreateRoleRequest): Promise<ForceRoleDTO> {
  const { data } = await axiosForBackend({
    url: '/api/role_manager/roles',
    method: 'POST',
    data: dto,
  });
  return data;
}

export async function updateRole(
  bizID: string,
  dto: UpdateRoleRequest,
): Promise<ForceRoleDTO> {
  const { data } = await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}`,
    method: 'PUT',
    data: dto,
  });
  return data;
}

export async function deleteRole(bizID: string): Promise<void> {
  await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}`,
    method: 'DELETE',
  });
}

export async function listMembers(
  bizID: string,
  params?: { type?: string; page?: number; pageSize?: number },
): Promise<ListMembersResponse> {
  const { data } = await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}/members`,
    method: 'GET',
    params,
  });
  return data;
}

export async function addMembers(
  bizID: string,
  dto: AddMembersRequest,
): Promise<void> {
  await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}/members`,
    method: 'POST',
    data: dto,
  });
}

export async function removeMembers(
  bizID: string,
  dto: RemoveMembersRequest,
): Promise<void> {
  await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}/members/batch_remove`,
    method: 'POST',
    data: dto,
  });
}

export async function searchMembers(
  dto: SearchMembersRequest,
): Promise<SearchResponse> {
  const { data } = await axiosForBackend({
    url: '/api/role_manager/search',
    method: 'POST',
    data: dto,
  });
  return data;
}

export async function getRolePermissions(
  bizID: string,
): Promise<RolePermissionConfig> {
  const { data } = await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}/permissions`,
    method: 'GET',
  });
  return data;
}

export async function updateRolePermissions(
  bizID: string,
  dto: UpdateRolePermissionsRequest,
): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/role_manager/roles/${bizID}/permissions`,
    method: 'PUT',
    data: dto,
  });
  return data;
}

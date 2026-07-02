import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DepartmentListResponse,
  DepartmentTreeNode,
  CreateDepartmentRequest,
} from '@shared/api.interface';

export async function list(): Promise<DepartmentListResponse> {
  const { data } = await axiosForBackend<DepartmentListResponse>({
    url: '/api/departments',
    method: 'GET',
  });
  return data;
}

export async function detail(id: string): Promise<DepartmentTreeNode> {
  const { data } = await axiosForBackend<DepartmentTreeNode>({
    url: `/api/departments/${id}`,
    method: 'GET',
  });
  return data;
}

export async function create(body: CreateDepartmentRequest): Promise<{ id: string }> {
  const { data } = await axiosForBackend<{ id: string }>({
    url: '/api/departments',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function update(id: string, body: CreateDepartmentRequest): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/departments/${id}`,
    method: 'PUT',
    data: body,
  });
  return data;
}


export async function listFlat() {
  const { data } = await axiosForBackend({
    url: '/api/departments/flat',
    method: 'GET',
  });
  return data;
}

export async function remove(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/departments/${id}`,
    method: 'DELETE',
  });
  return data;
}
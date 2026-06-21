import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  EmployeeListResponse,
  EmployeeDetail,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  CreateBindingRequest,
  BindingHistoryItem,
} from '@shared/api.interface';

export async function list(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  department?: string;
  positions?: string;
  title?: string;
  role?: string;
  status?: string;
}): Promise<EmployeeListResponse> {
  const { data } = await axiosForBackend({
    url: '/api/employees',
    method: 'GET',
    params,
  });
  return data;
}

export async function getPositions(): Promise<{ positions: string[] }> {
  const { data } = await axiosForBackend({
    url: '/api/employees/positions',
    method: 'GET',
  });
  return data;
}

export async function remove(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/employees/${id}`,
    method: 'DELETE',
  });
  return data;
}

export async function detail(id: string): Promise<EmployeeDetail> {
  const { data } = await axiosForBackend({
    url: `/api/employees/${id}`,
    method: 'GET',
  });
  return data;
}

export async function create(body: CreateEmployeeRequest): Promise<{ id: string }> {
  const { data } = await axiosForBackend({
    url: '/api/employees',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function update(id: string, body: UpdateEmployeeRequest): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/employees/${id}`,
    method: 'PUT',
    data: body,
  });
  return data;
}

export async function activate(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/employees/${id}/activate`,
    method: 'PATCH',
  });
  return data;
}

export async function deactivate(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/employees/${id}/deactivate`,
    method: 'PATCH',
  });
  return data;
}

export async function getMyPermissions(): Promise<{ role: string; permissions: unknown[] }> {
  const { data } = await axiosForBackend({
    url: '/api/employees/my/permissions',
    method: 'GET',
  });
  return data;
}

export async function updatePermissions(employeeId: string, permissions: unknown[]): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/employees/${employeeId}/permissions`,
    method: 'PUT',
    data: { permissions },
  });
  return data;
}

export async function bind(body: CreateBindingRequest): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: '/api/employees/bind',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function unbind(employeeId: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/employees/${employeeId}/unbind`,
    method: 'PATCH',
  });
  return data;
}

export async function bindingHistory(employeeId: string): Promise<{ items: BindingHistoryItem[] }> {
  const { data } = await axiosForBackend<{ items: BindingHistoryItem[] }>({
    url: `/api/employees/${employeeId}/binding-history`,
    method: 'GET',
  });
  return data;
}
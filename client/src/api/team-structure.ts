import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  TeamStructureListResponse,
  CreateBindingRequest,
  CreateResponse,
  SuccessResponse,
  BindingHistoryItem,
  TeamEmployeeDetail,
  TeamUpdateEmployeeRequest,
  BatchDeactivateRequest,
} from '@shared/api.interface';

export async function list(params: {
  employeeName?: string;
  department?: string;
  position?: string;
  templateId?: string;
  page?: number;
  pageSize?: number;
}): Promise<TeamStructureListResponse> {
  const { data } = await axiosForBackend({
    url: '/api/team-structure',
    method: 'GET',
    params,
  });
  return data;
}

export async function create(
  body: CreateBindingRequest,
): Promise<CreateResponse> {
  const { data } = await axiosForBackend({
    url: '/api/team-structure',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function deactivate(
  id: string,
): Promise<SuccessResponse & { message?: string }> {
  const { data } = await axiosForBackend({
    url: `/api/team-structure/${id}/deactivate`,
    method: 'PATCH',
  });
  return data;
}

export async function history(
  employeeId: string,
): Promise<{ items: BindingHistoryItem[] }> {
  const { data } = await axiosForBackend({
    url: `/api/team-structure/${employeeId}/history`,
    method: 'GET',
  });
  return data;
}

export async function getEmployee(
  id: string,
): Promise<TeamEmployeeDetail | null> {
  const { data } = await axiosForBackend({
    url: `/api/team-structure/employee/${id}`,
    method: 'GET',
  });
  return data;
}

export async function updateEmployee(
  id: string,
  body: TeamUpdateEmployeeRequest,
): Promise<SuccessResponse> {
  const { data } = await axiosForBackend({
    url: `/api/team-structure/employee/${id}`,
    method: 'PATCH',
    data: body,
  });
  return data;
}

export async function batchDeactivate(
  body: BatchDeactivateRequest,
): Promise<SuccessResponse & { deactivatedCount: number }> {
  const { data } = await axiosForBackend({
    url: '/api/team-structure/employees/deactivate',
    method: 'PATCH',
    data: body,
  });
  return data;
}
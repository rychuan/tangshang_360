import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  BitableConnectionListResponse,
  BitableConnectionItem,
  CreateBitableConnectionRequest,
  BitableSyncLogListResponse,
  BitableSyncLogDetail,
  BitableImportResponse,
  BitableExportResponse,
} from '@shared/api.interface';

export async function list(params: {
  page?: number;
  pageSize?: number;
}): Promise<BitableConnectionListResponse> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-connections',
    method: 'GET',
    params,
  });
  return data;
}

export async function detail(id: string): Promise<BitableConnectionItem> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'GET',
  });
  return data;
}

export async function create(
  body: CreateBitableConnectionRequest,
): Promise<{ id: string }> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-connections',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function update(
  id: string,
  body: CreateBitableConnectionRequest,
): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'PUT',
    data: body,
  });
  return data;
}

export async function remove(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}`,
    method: 'DELETE',
  });
  return data;
}

export async function importEmployees(
  id: string,
): Promise<BitableImportResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/import`,
    method: 'POST',
  });
  return data;
}

export async function exportEmployees(
  id: string,
): Promise<BitableExportResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/export`,
    method: 'POST',
  });
  return data;
}

export async function getLogs(
  id: string,
  params: { page?: number; pageSize?: number },
): Promise<BitableSyncLogListResponse> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${id}/logs`,
    method: 'GET',
    params,
  });
  return data;
}

export async function getLogDetail(
  connectionId: string,
  logId: string,
): Promise<BitableSyncLogDetail> {
  const { data } = await axiosForBackend({
    url: `/api/bitable-connections/${connectionId}/logs/${logId}`,
    method: 'GET',
  });
  return data;
}

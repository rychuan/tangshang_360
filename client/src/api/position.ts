import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  PositionListResponse,
  CreatePositionRequest,
  UpdatePositionRequest,
} from '@shared/api.interface';

export async function list(keyword?: string): Promise<PositionListResponse> {
  const { data } = await axiosForBackend<PositionListResponse>({
    url: '/api/positions',
    method: 'GET',
    params: keyword ? { keyword } : undefined,
  });
  return data;
}

export async function create(
  body: CreatePositionRequest,
): Promise<{ id: string }> {
  const { data } = await axiosForBackend<{ id: string }>({
    url: '/api/positions',
    method: 'POST',
    data: body,
  });
  return data;
}

export async function update(
  id: string,
  body: UpdatePositionRequest,
): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/positions/${id}`,
    method: 'PUT',
    data: body,
  });
  return data;
}

export async function remove(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend<{ success: boolean }>({
    url: `/api/positions/${id}`,
    method: 'DELETE',
  });
  return data;
}

import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  PerformanceGradeListResponse,
  ActiveGradeListResponse,
  CreatePerformanceGradeRequest,
  UpdatePerformanceGradeRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

export async function listActive(): Promise<ActiveGradeListResponse> {
  const res = await axiosForBackend<ActiveGradeListResponse>({
    url: '/api/performance-grades/active',
    method: 'GET',
  });
  return res.data;
}

export async function list(): Promise<PerformanceGradeListResponse> {
  const res = await axiosForBackend<PerformanceGradeListResponse>({
    url: '/api/performance-grades',
    method: 'GET',
  });
  return res.data;
}

export async function create(
  data: CreatePerformanceGradeRequest,
): Promise<CreateResponse> {
  const res = await axiosForBackend<CreateResponse>({
    url: '/api/performance-grades',
    method: 'POST',
    data,
  });
  return res.data;
}

export async function update(
  id: string,
  data: UpdatePerformanceGradeRequest,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/performance-grades/${id}`,
    method: 'PUT',
    data,
  });
  return res.data;
}

export async function remove(id: string): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/performance-grades/${id}`,
    method: 'DELETE',
  });
  return res.data;
}

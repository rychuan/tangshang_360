import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DashboardTodosResponse,
  DashboardOverviewResponse,
} from '@shared/api.interface';

export async function getTodos(): Promise<DashboardTodosResponse> {
  const res = await axiosForBackend<DashboardTodosResponse>({
    url: '/api/dashboard/todos',
    method: 'GET',
  });
  return res.data;
}

export async function getOverview(): Promise<DashboardOverviewResponse> {
  const res = await axiosForBackend<DashboardOverviewResponse>({
    url: '/api/dashboard/overview',
    method: 'GET',
  });
  return res.data;
}
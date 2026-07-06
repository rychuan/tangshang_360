import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  TeamOverviewResponse,
  SubordinatesResponse,
  RemindRequest,
  SuccessResponse,
} from '@shared/api.interface';

export async function getOverview(
  periods?: string[],
): Promise<TeamOverviewResponse> {
  const res = await axiosForBackend<TeamOverviewResponse>({
    url: '/api/team-performance/overview',
    method: 'GET',
    params: periods?.length ? { periods: periods.join(',') } : undefined,
  });
  return res.data;
}

export async function getSubordinates(params: {
  page: number;
  pageSize: number;
  status?: string;
  periods?: string[];
}): Promise<SubordinatesResponse> {
  const res = await axiosForBackend<SubordinatesResponse>({
    url: '/api/team-performance/subordinates',
    method: 'GET',
    params,
  });
  return res.data;
}

export async function sendRemind(
  body: RemindRequest,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: '/api/team-performance/remind',
    method: 'POST',
    data: body,
  });
  return res.data;
}

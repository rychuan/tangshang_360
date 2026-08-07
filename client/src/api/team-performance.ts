import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { unwrapApiData } from './response';
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
  return unwrapApiData<TeamOverviewResponse>(res.data);
}

export async function getSubordinates(params: {
  page: number;
  pageSize: number;
  status?: string;
  periods?: string[];
}): Promise<SubordinatesResponse> {
  const { periods, ...rest } = params;
  const res = await axiosForBackend<SubordinatesResponse>({
    url: '/api/team-performance/subordinates',
    method: 'GET',
    params: {
      ...rest,
      ...(periods?.length ? { periods: periods.join(',') } : {}),
    },
  });
  return unwrapApiData<SubordinatesResponse>(res.data);
}

export async function sendRemind(
  body: RemindRequest,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: '/api/team-performance/remind',
    method: 'POST',
    data: body,
  });
  return unwrapApiData<SuccessResponse>(res.data);
}

export async function unlockInstance(
  instanceId: string,
  reason: string,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/team-performance/instances/${instanceId}/unlock`,
    method: 'POST',
    data: { reason },
  });
  return unwrapApiData<SuccessResponse>(res.data);
}

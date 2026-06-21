import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  MyAssessmentRecordsResponse,
  MyAssessmentTrendResponse,
  MyAssessmentSummary,
} from '@shared/api.interface';

export async function getYears(): Promise<string[]> {
  const res = await axiosForBackend<string[]>({
    url: '/api/my-assessments/years',
    method: 'GET',
  });
  return res.data;
}

export async function getRecords(params: {
  page: number;
  pageSize: number;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<MyAssessmentRecordsResponse> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  if (params.status) query.set('status', params.status);
  if (params.periodStart) query.set('periodStart', params.periodStart);
  if (params.periodEnd) query.set('periodEnd', params.periodEnd);

  const res = await axiosForBackend<MyAssessmentRecordsResponse>({
    url: `/api/my-assessments/records?${query.toString()}`,
    method: 'GET',
  });
  return res.data;
}

export async function getTrend(year?: string): Promise<MyAssessmentTrendResponse> {
  const query = new URLSearchParams();
  if (year) query.set('year', year);
  const qs = query.toString();
  const res = await axiosForBackend<MyAssessmentTrendResponse>({
    url: `/api/my-assessments/trend${qs ? `?${qs}` : ''}`,
    method: 'GET',
  });
  return res.data;
}

export async function getSummary(year?: string): Promise<MyAssessmentSummary> {
  const query = new URLSearchParams();
  if (year) query.set('year', year);
  const qs = query.toString();
  const res = await axiosForBackend<MyAssessmentSummary>({
    url: `/api/my-assessments/summary${qs ? `?${qs}` : ''}`,
    method: 'GET',
  });
  return res.data;
}

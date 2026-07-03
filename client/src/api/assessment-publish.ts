import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  PublishEmployeeItem,
  PublishRequest,
  PublishResponse,
  AssessmentInstanceItem,
  AssessmentInstanceListResponse,
  AdjustRequest,
  UnlockRequest,
  PeriodStatisticsResponse,
  InstanceIndicatorsResponse,
  EmployeeSnapshotResponse,
  BatchUnlockRequest,
  BatchNotifyRequest,
  BatchReturnRequest,
  BatchOperationResponse,
  UnlockHistoryItem,
} from '@shared/api.interface';

export async function listEmployees(
  period: string,
  filters?: { department?: string; templateId?: string },
): Promise<{ items: PublishEmployeeItem[] }> {
  const params = new URLSearchParams({ period });
  if (filters?.department) {
    params.set('department', filters.department);
  }
  if (filters?.templateId) {
    params.set('templateId', filters.templateId);
  }
  const url = `/api/publish/employees?${params.toString()}`;
  const res = await axiosForBackend({
    url,
    method: 'GET',
  });
  return res.data;
}

export async function publish(data: PublishRequest): Promise<PublishResponse> {
  const res = await axiosForBackend({
    url: '/api/publish',
    method: 'POST',
    data,
  });
  return res.data;
}

export async function listInstances(params: {
  period: string;
  page: number;
  pageSize: number;
  status?: string;
  department?: string;
  grade?: string;
}): Promise<AssessmentInstanceListResponse> {
  const query = new URLSearchParams({
    period: params.period,
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.department) {
    query.set('department', params.department);
  }
  if (params.grade) {
    query.set('grade', params.grade);
  }
  const res = await axiosForBackend({
    url: `/api/assessment-instances?${query.toString()}`,
    method: 'GET',
  });
  return res.data;
}

export async function getEmployeeSnapshot(
  employeeId: string,
): Promise<EmployeeSnapshotResponse> {
  const res = await axiosForBackend({
    url: `/api/publish/employees/${employeeId}/indicators`,
    method: 'GET',
  });
  return res.data;
}

export async function adjustEmployeeSnapshot(
  employeeId: string,
  data: AdjustRequest,
): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/publish/employees/${employeeId}/indicators`,
    method: 'PATCH',
    data,
  });
  return res.data;
}

export async function deleteEmployeeSnapshot(
  employeeId: string,
): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/publish/employees/${employeeId}/indicators`,
    method: 'DELETE',
  });
  return res.data;
}

export async function unlock(
  id: string,
  data: UnlockRequest,
): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/unlock`,
    method: 'PATCH',
    data,
  });
  return res.data;
}

export async function getPeriodStatistics(
  period: string,
): Promise<PeriodStatisticsResponse> {
  const res = await axiosForBackend({
    url: `/api/publish/statistics?period=${encodeURIComponent(period)}`,
    method: 'GET',
  });
  return res.data;
}

export async function getInstanceIndicators(
  id: string,
): Promise<InstanceIndicatorsResponse> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/indicators`,
    method: 'GET',
  });
  return res.data;
}

export async function batchUnlock(
  data: BatchUnlockRequest,
): Promise<BatchOperationResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/batch-unlock',
    method: 'PATCH',
    data,
  });
  return res.data;
}

export async function batchResendNotification(
  data: BatchNotifyRequest,
): Promise<BatchOperationResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/batch-notify',
    method: 'POST',
    data,
  });
  return res.data;
}

export async function batchReturn(
  data: BatchReturnRequest,
): Promise<BatchOperationResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/batch-return',
    method: 'POST',
    data,
  });
  return res.data;
}

export async function getUnlockHistory(
  id: string,
): Promise<UnlockHistoryItem[]> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/unlock-history`,
    method: 'GET',
  });
  return res.data;
}

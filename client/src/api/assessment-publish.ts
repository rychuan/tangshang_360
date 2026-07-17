import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { unwrapApiData } from './response';
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
  BatchReturnRequest,
  BatchOperationResponse,
  ReminderPreviewResponse,
  UnfinishedReminderRequest,
  UnfinishedReminderResponse,
  UnlockHistoryItem,
} from '@shared/api.interface';

export async function listEmployees(
  period: string,
  filters?: { department?: string; templateId?: string },
): Promise<{ items: PublishEmployeeItem[] }> {
  const params = new URLSearchParams();
  params.set('periods', period);
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
  return unwrapApiData<{ items: PublishEmployeeItem[] }>(res.data);
}

export async function publish(data: PublishRequest): Promise<PublishResponse> {
  const res = await axiosForBackend({
    url: '/api/publish',
    method: 'POST',
    data,
  });
  return unwrapApiData<PublishResponse>(res.data);
}

export async function listInstances(params: {
  periods?: string[];
  page: number;
  pageSize: number;
  status?: string;
  department?: string;
  grade?: string;
}): Promise<AssessmentInstanceListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.periods?.length) {
    query.set('periods', params.periods.join(','));
  }
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
  return unwrapApiData<AssessmentInstanceListResponse>(res.data);
}

export async function exportInstances(
  instanceIds: string[],
): Promise<AssessmentInstanceItem[]> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/export',
    method: 'POST',
    data: { instanceIds },
  });
  return unwrapApiData<{ items: AssessmentInstanceItem[] }>(res.data).items;
}

export async function getEmployeeSnapshot(
  employeeId: string,
): Promise<EmployeeSnapshotResponse> {
  const res = await axiosForBackend({
    url: `/api/publish/employees/${employeeId}/indicators`,
    method: 'GET',
  });
  return unwrapApiData<EmployeeSnapshotResponse>(res.data);
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
  return unwrapApiData<{ success: boolean }>(res.data);
}

export async function deleteEmployeeSnapshot(
  employeeId: string,
): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/publish/employees/${employeeId}/indicators`,
    method: 'DELETE',
  });
  return unwrapApiData<{ success: boolean }>(res.data);
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
  return unwrapApiData<{ success: boolean }>(res.data);
}

export async function getPeriodStatistics(
  period: string,
): Promise<PeriodStatisticsResponse> {
  const res = await axiosForBackend({
    url: `/api/publish/statistics?periods=${encodeURIComponent(period)}`,
    method: 'GET',
  });
  return unwrapApiData<PeriodStatisticsResponse>(res.data);
}

export async function getInstanceIndicators(
  id: string,
): Promise<InstanceIndicatorsResponse> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/indicators`,
    method: 'GET',
  });
  return unwrapApiData<InstanceIndicatorsResponse>(res.data);
}

export async function batchUnlock(
  data: BatchUnlockRequest,
): Promise<BatchOperationResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/batch-unlock',
    method: 'PATCH',
    data,
  });
  return unwrapApiData<BatchOperationResponse>(res.data);
}

export async function previewUnfinishedReminders(params: {
  periods?: string[];
  department?: string;
  status?: string;
  grade?: string;
}): Promise<ReminderPreviewResponse> {
  const query = new URLSearchParams();
  if (params.periods?.length) {
    query.set('periods', params.periods.join(','));
  }
  if (params.department) {
    query.set('department', params.department);
  }
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.grade) {
    query.set('grade', params.grade);
  }
  const res = await axiosForBackend({
    url: `/api/assessment-instances/reminder-preview?${query.toString()}`,
    method: 'GET',
  });
  return unwrapApiData<ReminderPreviewResponse>(res.data);
}

export async function remindUnfinishedAssessments(
  data: UnfinishedReminderRequest,
): Promise<UnfinishedReminderResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/remind-unfinished',
    method: 'POST',
    data,
  });
  return unwrapApiData<UnfinishedReminderResponse>(res.data);
}

export async function batchReturn(
  data: BatchReturnRequest,
): Promise<BatchOperationResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/batch-return',
    method: 'POST',
    data,
  });
  return unwrapApiData<BatchOperationResponse>(res.data);
}

export async function getUnlockHistory(
  id: string,
): Promise<UnlockHistoryItem[]> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/unlock-history`,
    method: 'GET',
  });
  return unwrapApiData<UnlockHistoryItem[]>(res.data);
}

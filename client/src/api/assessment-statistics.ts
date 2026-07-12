import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { unwrapApiData } from './response';
import type {
  StatisticsRecordsResponse,
  ChartsResponse,
  StatisticsRecordItem,
  ExportResult,
} from '@shared/api.interface';

export interface StatisticsRecordsParams {
  page?: number;
  pageSize?: number;
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
  employeeIds?: string[];
}

export interface StatisticsChartsParams {
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
}

export interface StatisticsExportParams {
  periods?: string[];
  departments?: string[];
  positions?: string[];
  grades?: string[];
  employeeIds?: string[];
}

export async function getRecords(
  params: StatisticsRecordsParams,
): Promise<StatisticsRecordsResponse> {
  const res = await axiosForBackend<StatisticsRecordsResponse>({
    url: '/api/statistics/records',
    method: 'GET',
    params: {
      page: params.page,
      pageSize: params.pageSize,
      periods: params.periods?.join(',') || undefined,
      departments: params.departments?.join(',') || undefined,
      positions: params.positions?.join(',') || undefined,
      grades: params.grades?.join(',') || undefined,
      employeeIds: params.employeeIds?.join(',') || undefined,
    },
  });
  return unwrapApiData<StatisticsRecordsResponse>(res.data);
}

export async function getCharts(
  params: StatisticsChartsParams,
): Promise<ChartsResponse> {
  const res = await axiosForBackend<ChartsResponse>({
    url: '/api/statistics/charts',
    method: 'GET',
    params: {
      periods: params.periods?.join(',') || undefined,
      departments: params.departments?.join(',') || undefined,
      positions: params.positions?.join(',') || undefined,
      grades: params.grades?.join(',') || undefined,
    },
  });
  return unwrapApiData<ChartsResponse>(res.data);
}

export async function exportData(
  params: StatisticsExportParams,
): Promise<StatisticsRecordItem[]> {
  const res = await axiosForBackend<ExportResult>({
    url: '/api/statistics/export',
    method: 'GET',
    params: {
      periods: params.periods?.join(',') || undefined,
      departments: params.departments?.join(',') || undefined,
      positions: params.positions?.join(',') || undefined,
      grades: params.grades?.join(',') || undefined,
      employeeIds: params.employeeIds?.join(',') || undefined,
    },
  });
  return unwrapApiData<ExportResult>(res.data).items;
}

import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

export async function importFromBitable(): Promise<BitablePluginSyncResponse> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-sync/import',
    method: 'POST',
  });
  return data;
}

export async function exportToBitable(): Promise<BitablePluginSyncResponse> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-sync/export',
    method: 'POST',
  });
  return data;
}

export async function exportPerformanceToBitable(): Promise<BitablePluginSyncResponse> {
  const { data } = await axiosForBackend({
    url: '/api/bitable-sync/performance-export',
    method: 'POST',
  });
  return data;
}

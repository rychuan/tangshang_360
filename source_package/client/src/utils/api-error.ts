import { toast } from 'sonner';
import type { AxiosError } from 'axios';

interface ApiErrorResponseData {
  error?: { message?: string };
}

export function handleApiError(error: unknown): void {
  const axiosError = error as AxiosError<ApiErrorResponseData> | undefined;
  if (axiosError?.response?.status === 403) {
    toast.error('您没有权限执行此操作');
    return;
  }
  if (axiosError?.response?.status === 401) {
    return; // handled by axiosForBackend interceptor
  }
  const message =
    axiosError?.response?.data?.error?.message || '操作失败，请重试';
  toast.error(message);
}

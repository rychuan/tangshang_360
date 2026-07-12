import { toast } from 'sonner';
import type { AxiosError } from 'axios';

interface ApiErrorResponseData {
  error?: { message?: string };
  message?: string;
}

export function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponseData> | undefined;
  return (
    axiosError?.response?.data?.error?.message ||
    axiosError?.response?.data?.message ||
    (error instanceof Error ? error.message : undefined)
  );
}

export function handleApiError(error: unknown): void {
  const axiosError = error as AxiosError<ApiErrorResponseData> | undefined;
  const message = getApiErrorMessage(error);
  if (axiosError?.response?.status === 403) {
    toast.error(message || '您没有权限执行此操作');
    return;
  }
  if (axiosError?.response?.status === 401) {
    return; // handled by axiosForBackend interceptor
  }
  toast.error(message || '操作失败，请重试');
}

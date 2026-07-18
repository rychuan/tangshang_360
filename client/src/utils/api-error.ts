import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import type {
  ApiErrorResponseData,
  RoleMemberMutationErrorDetails,
  RoleMemberMutationOutcome,
} from '@shared/api.interface';

const SUCCESSFUL_MUTATION_STATUSES = new Set(['synced', 'unchanged']);

const MUTATION_STATUS_LABELS: Partial<
  Record<RoleMemberMutationOutcome['status'], string>
> = {
  failed: '同步失败',
  superseded: '已被后续变更替代',
  not_processable: '无法处理同步任务',
  stale_owner: '同步任务冲突',
};

export function getRoleMutationFailureSummary(
  error: unknown,
): string | undefined {
  const axiosError = error as
    | AxiosError<ApiErrorResponseData<RoleMemberMutationErrorDetails>>
    | undefined;
  const outcomes = axiosError?.response?.data?.error?.details?.outcomes;
  if (!Array.isArray(outcomes)) return undefined;

  const failures = outcomes.filter(
    (outcome) =>
      outcome &&
      typeof outcome.userId === 'string' &&
      typeof outcome.status === 'string' &&
      !SUCCESSFUL_MUTATION_STATUSES.has(outcome.status),
  );
  if (failures.length === 0) return undefined;

  return failures
    .map((outcome) => {
      const reason =
        outcome.error ||
        MUTATION_STATUS_LABELS[outcome.status] ||
        outcome.status;
      return `${outcome.userId}（${reason}）`;
    })
    .join('；');
}

export function getApiErrorMessage(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorResponseData> | undefined;
  const message =
    axiosError?.response?.data?.error?.message ||
    axiosError?.response?.data?.message ||
    (error instanceof Error ? error.message : undefined);
  const mutationSummary = getRoleMutationFailureSummary(error);
  if (!mutationSummary) return message;
  return message
    ? `${message}：${mutationSummary}`
    : `成员授权同步失败：${mutationSummary}`;
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

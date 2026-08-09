import { roleManager } from '@/api';
import type {
  RoleMemberMutationOutcome,
  RoleMemberMutationResponse,
} from '@shared/api.interface';

/**
 * 自定义角色成员变更（add/remove）的授权同步结果处理：
 * - 后端 mutateCustomRoleMembers 对每个成员返回 outcome（synced/unchanged/failed/...）
 * - 部分失败时请求会抛 BadGatewayException，outcomes 在错误响应体里
 * 这里统一收集失败的 outcome 供前端展示与逐人重试。
 */

/** 需要提示并支持重试的失败状态（superseded/stale_owner 由更新的版本/持有方负责，不提示） */
export const RETRYABLE_FAILED_STATUSES = new Set(['failed', 'not_processable']);

export function collectFailedOutcomes(
  response: RoleMemberMutationResponse,
): RoleMemberMutationOutcome[] {
  return response.outcomes.filter((outcome) =>
    RETRYABLE_FAILED_STATUSES.has(outcome.status),
  );
}

/** 从 axios 错误中提取后端返回的 outcomes（BadGatewayException 携带完整 result） */
export function extractOutcomesFromError(
  err: unknown,
): RoleMemberMutationOutcome[] | null {
  const data =
    (err as { response?: { data?: unknown } })?.response?.data ??
    (err as { data?: unknown })?.data;
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { outcomes?: unknown }).outcomes)
  ) {
    return (data as { outcomes: RoleMemberMutationOutcome[] }).outcomes;
  }
  return null;
}

export interface RetryResult {
  ok: boolean;
  error?: string;
}

/** 对单个失败成员发起授权重试（后端用 durable 期望角色重建同步） */
export async function retryFailedOutcome(
  outcome: RoleMemberMutationOutcome,
): Promise<RetryResult> {
  try {
    const res = await roleManager.retryAuthorization(outcome.userId);
    if (res.status === 'synced') return { ok: true };
    return {
      ok: false,
      error: res.error || `授权同步状态: ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        (err as { message?: string })?.message ||
        '授权重试失败，请稍后再试',
    };
  }
}

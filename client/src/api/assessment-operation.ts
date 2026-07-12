import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AssessmentInstanceDetail,
  RatingSubmitRequest,
  RatingSubmitWithSignRequest,
  SupervisorRatingResponse,
  SignRequest,
} from '@shared/api.interface';

function isAssessmentDetailPayload(
  value: unknown,
): value is AssessmentInstanceDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { indicators?: unknown }).indicators)
  );
}

export function normalizeAssessmentDetailResponse(
  value: unknown,
): AssessmentInstanceDetail {
  if (isAssessmentDetailPayload(value)) {
    return value;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    isAssessmentDetailPayload((value as { data?: unknown }).data)
  ) {
    return (value as { data: AssessmentInstanceDetail }).data;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: { message?: unknown } }).error?.message ===
      'string'
  ) {
    throw new Error((value as { error: { message: string } }).error.message);
  }
  throw new Error('接口返回数据格式异常');
}

export async function detail(id: string): Promise<AssessmentInstanceDetail> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}`,
    method: 'GET',
  });
  return normalizeAssessmentDetailResponse(res.data);
}

export async function submitSelfRating(
  id: string,
  data: RatingSubmitRequest,
): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/self-rating`,
    method: 'POST',
    data,
  });
  return res.data;
}

export async function submitSelfRatingWithSign(
  id: string,
  data: RatingSubmitWithSignRequest,
): Promise<{ success: boolean; status: string }> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/self-rating-with-sign`,
    method: 'POST',
    data,
  });
  return res.data;
}

export async function submitSupervisorRating(
  id: string,
  data: RatingSubmitRequest,
): Promise<SupervisorRatingResponse> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/supervisor-rating`,
    method: 'POST',
    data,
  });
  return res.data;
}

export async function submitSupervisorRatingWithSign(
  id: string,
  data: RatingSubmitWithSignRequest,
): Promise<SupervisorRatingResponse & { status: string }> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/supervisor-rating-with-sign`,
    method: 'POST',
    data,
  });
  return res.data;
}

export async function sign(
  id: string,
  data: SignRequest,
): Promise<{ success: boolean; status: string }> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/sign`,
    method: 'POST',
    data,
  });
  return res.data;
}

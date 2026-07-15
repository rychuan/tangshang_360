import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { unwrapApiData } from './response';
import type {
  SignTokenResponse,
  SignSessionResponse,
  SignStatusResponse,
} from '@shared/api.interface';

export async function generateSignToken(
  id: string,
  signType: 'self' | 'supervisor',
): Promise<SignTokenResponse> {
  const res = await axiosForBackend({
    url: `/api/assessment-instances/${id}/sign-token`,
    method: 'POST',
    data: { signType },
  });
  return unwrapApiData<SignTokenResponse>(res.data);
}

export async function getSignSession(
  token: string,
): Promise<SignSessionResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/sign-session',
    method: 'GET',
    params: { token },
  });
  return unwrapApiData<SignSessionResponse>(res.data);
}

export async function submitSignByToken(data: {
  token: string;
  signName: string;
  signImage?: string;
}): Promise<{ success: boolean; status: string }> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/sign-session',
    method: 'POST',
    data,
  });
  return unwrapApiData<{ success: boolean; status: string }>(res.data);
}

export async function checkSignStatus(
  token: string,
): Promise<SignStatusResponse> {
  const res = await axiosForBackend({
    url: '/api/assessment-instances/sign-session/status',
    method: 'GET',
    params: { token },
  });
  return unwrapApiData<SignStatusResponse>(res.data);
}

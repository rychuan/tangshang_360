import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AssessmentTemplateListResponse,
  AssessmentTemplateDetail,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

export async function list(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  position?: string;
  status?: string;
}): Promise<AssessmentTemplateListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page));
  searchParams.set('pageSize', String(params.pageSize));
  if (params.keyword) searchParams.set('keyword', params.keyword);
  if (params.position) searchParams.set('position', params.position);
  if (params.status) searchParams.set('status', params.status);

  const res = await axiosForBackend<AssessmentTemplateListResponse>({
    url: `/api/assessment-templates?${searchParams.toString()}`,
    method: 'GET',
  });
  return res.data;
}

export async function detail(
  id: string,
): Promise<AssessmentTemplateDetail> {
  const res = await axiosForBackend<AssessmentTemplateDetail>({
    url: `/api/assessment-templates/${id}`,
    method: 'GET',
  });
  return res.data;
}

export async function create(
  data: CreateTemplateRequest,
): Promise<CreateResponse> {
  const res = await axiosForBackend<CreateResponse>({
    url: '/api/assessment-templates',
    method: 'POST',
    data,
  });
  return res.data;
}

export async function update(
  id: string,
  data: UpdateTemplateRequest,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/assessment-templates/${id}`,
    method: 'PUT',
    data,
  });
  return res.data;
}

export async function deactivate(
  id: string,
): Promise<SuccessResponse> {
  const res = await axiosForBackend<SuccessResponse>({
    url: `/api/assessment-templates/${id}/deactivate`,
    method: 'PATCH',
  });
  return res.data;
}
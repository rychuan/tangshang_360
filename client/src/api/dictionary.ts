import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DictListResponse,
  CreateDictRequest,
  UpdateDictRequest,
} from '@shared/api.interface';

const dictApi = (type: string) => ({
  async list(
    keyword?: string,
    onlyActive?: boolean,
  ): Promise<DictListResponse> {
    const { data } = await axiosForBackend<DictListResponse>({
      url: `/api/dictionary/${type}`,
      method: 'GET',
      params: {
        ...(keyword ? { keyword } : {}),
        ...(onlyActive ? { onlyActive: 'true' } : {}),
      },
    });
    return data;
  },
  async create(body: CreateDictRequest): Promise<{ id: string }> {
    const { data } = await axiosForBackend<{ id: string }>({
      url: `/api/dictionary/${type}`,
      method: 'POST',
      data: body,
    });
    return data;
  },
  async update(
    id: string,
    body: UpdateDictRequest,
  ): Promise<{ success: boolean }> {
    const { data } = await axiosForBackend<{ success: boolean }>({
      url: `/api/dictionary/${type}/${id}`,
      method: 'PUT',
      data: body,
    });
    return data;
  },
  async remove(id: string): Promise<{ success: boolean }> {
    const { data } = await axiosForBackend<{ success: boolean }>({
      url: `/api/dictionary/${type}/${id}`,
      method: 'DELETE',
    });
    return data;
  },
});

export default dictApi;

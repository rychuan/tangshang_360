import { toast } from 'sonner';
import { getApiErrorMessage, handleApiError } from '../../client/src/utils/api-error';

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

describe('handleApiError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves backend 403 messages', () => {
    handleApiError({
      response: {
        status: 403,
        data: { error: { message: '无权查看该考核记录' } },
      },
    });

    expect(toast.error).toHaveBeenCalledWith('无权查看该考核记录');
  });

  it('uses the default permission message when 403 has no backend message', () => {
    handleApiError({
      response: {
        status: 403,
        data: {},
      },
    });

    expect(toast.error).toHaveBeenCalledWith('您没有权限执行此操作');
  });

  it('extracts direct response messages', () => {
    expect(
      getApiErrorMessage({
        response: {
          status: 400,
          data: { message: '参数错误' },
        },
      }),
    ).toBe('参数错误');
  });

  it('does not toast for 401 errors handled by the interceptor', () => {
    handleApiError({
      response: {
        status: 401,
        data: { error: { message: '登录已失效' } },
      },
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});

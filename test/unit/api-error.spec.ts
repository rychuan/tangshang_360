import { toast } from 'sonner';
import {
  getApiErrorMessage,
  getRoleMutationFailureSummary,
  handleApiError,
} from '../../client/src/utils/api-error';

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

  it('extracts structured role mutation failure outcomes', () => {
    const error = {
      response: {
        status: 502,
        data: {
          error: {
            message: '部分成员授权同步失败',
            details: {
              message: '部分成员授权同步失败',
              success: false,
              outcomes: [
                { userId: 'employee-1', status: 'synced', version: 1 },
                {
                  userId: 'employee-2',
                  status: 'failed',
                  version: 2,
                  error: 'sdk add failed',
                },
                {
                  userId: 'employee-3',
                  status: 'stale_owner',
                  version: 3,
                },
              ],
            },
          },
        },
      },
    };

    expect(getRoleMutationFailureSummary(error)).toBe(
      'employee-2（sdk add failed）；employee-3（同步任务冲突）',
    );
    expect(getApiErrorMessage(error)).toBe(
      '部分成员授权同步失败：employee-2（sdk add failed）；employee-3（同步任务冲突）',
    );

    handleApiError(error);

    expect(toast.error).toHaveBeenCalledWith(
      '部分成员授权同步失败：employee-2（sdk add failed）；employee-3（同步任务冲突）',
    );
  });
});

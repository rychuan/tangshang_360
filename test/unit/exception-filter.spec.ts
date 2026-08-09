import {
  BadGatewayException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '../../server/common/filters/exception.filter';
import { ResponseCode } from '../../server/common/constants/api_response_code';
import { BusinessException } from '../../server/common/interfaces/exception.interface';

function createHttpHost() {
  const response = {
    headersSent: false,
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: jest.fn(() => ({
      getResponse: jest.fn(() => response),
    })),
  };
  return { host, response };
}

describe('GlobalExceptionFilter', () => {
  it('preserves role mutation outcomes as structured 502 details', () => {
    const { host, response } = createHttpHost();
    const outcomes = [
      { userId: 'employee-1', status: 'synced', version: 1 },
      {
        userId: 'employee-2',
        status: 'failed',
        version: 2,
        error: 'sdk add failed',
      },
    ];

    new GlobalExceptionFilter().catch(
      new BadGatewayException({
        message: '部分成员授权同步失败',
        success: false,
        outcomes,
      }),
      host as any,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: ResponseCode.BAD_GATEWAY,
        message: '部分成员授权同步失败',
        details: {
          message: '部分成员授权同步失败',
          success: false,
          outcomes,
        },
      }),
    });
  });

  it('preserves BusinessException string details and field errors', () => {
    const { host, response } = createHttpHost();

    new GlobalExceptionFilter().catch(
      new BusinessException(
        ResponseCode.VALIDATION_ERROR,
        '参数验证失败',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'validation details',
        { name: ['名称不能为空'] },
      ),
      host as any,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: ResponseCode.VALIDATION_ERROR,
        message: '参数验证失败',
        details: 'validation details',
        fieldErrors: { name: ['名称不能为空'] },
      }),
    });
  });

  it('preserves ordinary HttpException message and status mapping', () => {
    const { host, response } = createHttpHost();

    new GlobalExceptionFilter().catch(
      new BadRequestException('参数错误'),
      host as any,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: ResponseCode.BAD_REQUEST,
        message: '参数错误',
      }),
    });
  });

  it('omits stack and cause for unknown errors in production', () => {
    const { host, response } = createHttpHost();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      new GlobalExceptionFilter().catch(new Error('内部细节'), host as any);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: ResponseCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      }),
    });
    const payload = response.json.mock.calls[0][0] as {
      error: Record<string, unknown>;
    };
    expect(payload.error.stack).toBeUndefined();
    expect(payload.error.cause).toBeUndefined();
  });

  it('exposes stack and cause for unknown errors in development', () => {
    const { host, response } = createHttpHost();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const err = new Error('内部细节');
      err.cause = new Error('根因');
      new GlobalExceptionFilter().catch(err, host as any);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    const payload = response.json.mock.calls[0][0] as {
      error: { stack?: string; cause?: string };
    };
    expect(payload.error.stack).toContain('内部细节');
    expect(payload.error.cause).toBe('根因');
  });
});

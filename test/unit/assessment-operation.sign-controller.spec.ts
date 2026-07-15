const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Post: noopDecorator,
    Param: noopDecorator,
    Body: noopDecorator,
    Req: noopDecorator,
    Query: noopDecorator,
  };
});

jest.mock('@lark-apaas/fullstack-nestjs-core', () => {
  const actual = jest.requireActual('@lark-apaas/fullstack-nestjs-core');
  return {
    ...actual,
    NeedLogin: noopDecorator,
    CanRole: noopDecorator,
  };
});

jest.mock(
  '../../server/common/decorators/require-permission.decorator',
  () => ({
    RequirePermission: noopDecorator,
  }),
);

import { AssessmentOperationController } from '../../server/modules/assessment-operation/assessment-operation.controller';

describe('AssessmentOperationController mobile signing', () => {
  function request(userId = 'user-id', userName = '张三') {
    return {
      userContext: { userId, userName },
    } as any;
  }

  it('passes the raw token to the atomic service without consuming it first', async () => {
    const service = {
      signByToken: jest
        .fn()
        .mockResolvedValue({ success: true, status: 'succeeded' }),
    };
    const tokenService = {
      consumeToken: jest.fn(),
    };
    const controller = new AssessmentOperationController(
      service as any,
      tokenService as any,
    );

    await expect(
      controller.signByToken(request(), {
        token: 'raw-token',
        signImage: 'data:image/png;base64,cG5n',
      }),
    ).resolves.toEqual({ success: true, status: 'succeeded' });

    expect(tokenService.consumeToken).not.toHaveBeenCalled();
    expect(service.signByToken).toHaveBeenCalledWith(
      'raw-token',
      'user-id',
      '张三',
      'data:image/png;base64,cG5n',
    );
  });

  it('deletes the session and propagates an error when message delivery fails', async () => {
    const deliveryFailure = Promise.reject(new Error('delivery failed'));
    void deliveryFailure.catch(() => undefined);
    const service = {
      generateSignSession: jest.fn().mockResolvedValue({
        instanceId: 'instance-id',
        signType: 'self',
        employeeName: '张三',
        period: '2026-07',
      }),
    };
    const tokenService = {
      generateToken: jest.fn().mockResolvedValue('raw-token'),
      sendSignMessage: jest.fn().mockReturnValue(deliveryFailure),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AssessmentOperationController(
      service as any,
      tokenService as any,
    );

    await expect(
      controller.generateSignToken(request(), 'instance-id', {
        signType: 'self',
        appBaseUrl: 'https://example.com/app/test/',
      }),
    ).rejects.toThrow('delivery failed');

    expect(tokenService.deleteSession).toHaveBeenCalledWith('raw-token');
  });
});

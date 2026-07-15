import { SignTokenService } from '../../server/modules/assessment-operation/sign-token.service';

describe('SignTokenService', () => {
  function createService(options?: {
    selectedRows?: unknown[];
    sendError?: Error;
  }) {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn(() => ({ values }));
    const limit = jest.fn().mockResolvedValue(options?.selectedRows ?? []);
    const whereSelect = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where: whereSelect }));
    const select = jest.fn(() => ({ from }));
    const whereDelete = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn(() => ({ where: whereDelete }));
    const call = options?.sendError
      ? jest.fn().mockRejectedValue(options.sendError)
      : jest.fn().mockResolvedValue(undefined);
    const load = jest.fn(() => ({ call }));

    const service = new SignTokenService(
      {
        insert,
        select,
        delete: deleteFn,
      } as any,
      { load } as any,
    );

    return {
      service,
      mocks: {
        values,
        insert,
        select,
        from,
        whereSelect,
        limit,
        deleteFn,
        whereDelete,
        load,
        call,
      },
    };
  }

  it('stores only a token hash when generating a session', async () => {
    const { service, mocks } = createService();

    const token = await service.generateToken({
      instanceId: 'instance-id',
      signType: 'self',
      userId: 'user-id',
      userName: '张三',
    });

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        instanceId: 'instance-id',
        userId: 'user-id',
        status: 'pending',
      }),
    );
    expect(mocks.values.mock.calls[0][0].tokenHash).not.toBe(token);
  });

  it('returns the persisted session for a token', async () => {
    const row = {
      id: 'session-id',
      tokenHash: 'hash',
      instanceId: 'instance-id',
      signType: 'self',
      userId: 'user-id',
      userName: '张三',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const { service } = createService({ selectedRows: [row] });

    await expect(service.getSession('token')).resolves.toBe(row);
  });

  it('deletes a persisted session by token hash', async () => {
    const { service, mocks } = createService();

    await service.deleteSession('token');

    expect(mocks.deleteFn).toHaveBeenCalled();
    expect(mocks.whereDelete).toHaveBeenCalled();
  });

  it('propagates Feishu delivery failures', async () => {
    const { service } = createService({
      sendError: new Error('delivery failed'),
    });

    await expect(
      service.sendSignMessage(
        'user-id',
        'https://example.com/mobile-sign?token=x',
        '2026-07',
        'self',
        '张三',
      ),
    ).rejects.toThrow('delivery failed');
  });
});

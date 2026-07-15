import { AssessmentOperationService } from '../../server/modules/assessment-operation/assessment-operation.service';

describe('AssessmentOperationService sign session transaction', () => {
  it('writes the authenticated signer, instance state, audit, and session success together', async () => {
    const future = new Date(Date.now() + 60_000);
    const selectedRows = [
      [
        {
          id: 'session-id',
          tokenHash: 'hash',
          instanceId: 'instance-id',
          signType: 'self',
          userId: 'employee-id',
          userName: '旧姓名',
          status: 'pending',
          expiresAt: future,
        },
      ],
      [
        {
          status: 'pending_sign',
          selfSignName: null,
          supervisorSignName: null,
          employeeId: 'employee-id',
          supervisorId: 'supervisor-id',
        },
      ],
    ];
    const updatePayloads: Array<Record<string, unknown>> = [];
    const auditValues = jest.fn().mockResolvedValue(undefined);

    const tx = {
      select: jest.fn(() => {
        const rows = selectedRows.shift() ?? [];
        const limit = jest.fn().mockResolvedValue(rows);
        return {
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              for: jest.fn(() => ({ limit })),
              limit,
            })),
          })),
        };
      }),
      update: jest.fn(() => ({
        set: jest.fn((values: Record<string, unknown>) => {
          updatePayloads.push(values);
          return {
            where: jest.fn().mockResolvedValue(undefined),
          };
        }),
      })),
      insert: jest.fn(() => ({ values: auditValues })),
    };
    const db = {
      transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AssessmentOperationService(
      db as any,
      {} as any,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'self',
          departmentIds: [],
        }),
      } as any,
    );

    await expect(
      service.signByToken(
        'raw-token',
        'employee-id',
        '当前认证姓名',
        'data:image/png;base64,cG5n',
      ),
    ).resolves.toEqual({ success: true, status: 'succeeded' });

    expect(updatePayloads[0]).toMatchObject({
      selfSignName: '当前认证姓名',
      selfSignImage: 'data:image/png;base64,cG5n',
      status: 'supervisor_review',
    });
    expect(updatePayloads[1]).toMatchObject({
      status: 'succeeded',
      failureReason: null,
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'employee-id',
        action: 'sign_self_by_token',
        targetId: 'instance-id',
      }),
    );
  });
});

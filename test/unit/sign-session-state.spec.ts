import { resolveSignSessionStatus } from '../../server/modules/assessment-operation/sign-session.utils';

describe('resolveSignSessionStatus', () => {
  const pendingSession = {
    userId: 'user-a',
    signType: 'self' as const,
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000),
  };

  const pendingInstance = {
    status: 'pending_sign',
    selfSignName: null,
    supervisorSignName: null,
  };

  it('returns invalid when the session does not exist', () => {
    expect(
      resolveSignSessionStatus(null, pendingInstance, 'user-a'),
    ).toBe('invalid');
  });

  it('returns forbidden for a different logged-in user', () => {
    expect(
      resolveSignSessionStatus(pendingSession, pendingInstance, 'user-b'),
    ).toBe('forbidden');
  });

  it('returns expired for an overdue pending session', () => {
    expect(
      resolveSignSessionStatus(
        {
          ...pendingSession,
          expiresAt: new Date(Date.now() - 1),
        },
        pendingInstance,
        'user-a',
      ),
    ).toBe('expired');
  });

  it('returns succeeded when the corresponding instance signature exists', () => {
    expect(
      resolveSignSessionStatus(
        pendingSession,
        {
          ...pendingInstance,
          status: 'supervisor_review',
          selfSignName: '张三',
        },
        'user-a',
      ),
    ).toBe('succeeded');
  });

  it('returns failed when a previously successful signature was cleared by unlock', () => {
    expect(
      resolveSignSessionStatus(
        {
          ...pendingSession,
          status: 'succeeded',
        },
        {
          ...pendingInstance,
          status: 'self_review',
          selfSignName: null,
        },
        'user-a',
      ),
    ).toBe('failed');
  });

  it('returns failed when the workflow moved away without the signature', () => {
    expect(
      resolveSignSessionStatus(
        pendingSession,
        {
          ...pendingInstance,
          status: 'self_review',
        },
        'user-a',
      ),
    ).toBe('failed');
  });

  it('returns pending while the workflow still allows the requested signature', () => {
    expect(
      resolveSignSessionStatus(pendingSession, pendingInstance, 'user-a'),
    ).toBe('pending');
  });
});

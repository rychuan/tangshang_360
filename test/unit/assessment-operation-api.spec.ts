jest.mock('@lark-apaas/client-toolkit/utils/getAxiosForBackend', () => ({
  axiosForBackend: jest.fn(),
}));

import { normalizeAssessmentDetailResponse } from '../../client/src/api/assessment-operation';

describe('normalizeAssessmentDetailResponse', () => {
  const detail = {
    id: 'instance-id',
    period: '2026-07',
    employeeId: 'employee-id',
    employeeName: '张三',
    position: '主播',
    supervisorId: 'supervisor-id',
    supervisorName: '李四',
    status: 'completed',
    indicators: [],
  };

  it('returns direct detail payloads unchanged', () => {
    expect(normalizeAssessmentDetailResponse(detail)).toBe(detail);
  });

  it('unwraps platform response envelopes', () => {
    expect(normalizeAssessmentDetailResponse({ data: detail })).toBe(detail);
  });

  it('throws server error messages from error envelopes', () => {
    expect(() =>
      normalizeAssessmentDetailResponse({ error: { message: 'forbidden' } }),
    ).toThrow('forbidden');
  });

  it('throws when the response is not an assessment detail payload', () => {
    expect(() => normalizeAssessmentDetailResponse({ ok: true })).toThrow(
      '接口返回数据格式异常',
    );
  });
});

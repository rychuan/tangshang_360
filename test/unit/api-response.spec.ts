import { unwrapApiData } from '../../client/src/api/response';

describe('unwrapApiData', () => {
  it('returns direct payloads unchanged', () => {
    const payload = { items: [] };
    expect(unwrapApiData(payload)).toBe(payload);
  });

  it('unwraps platform data envelopes', () => {
    const payload = { items: [] };
    expect(unwrapApiData({ data: payload })).toBe(payload);
  });

  it('throws backend error messages from error envelopes', () => {
    expect(() =>
      unwrapApiData({ error: { message: '无权查看该考核记录' } }),
    ).toThrow('无权查看该考核记录');
  });
});

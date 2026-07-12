import { parsePeriodsQuery } from './periods-query';

describe('parsePeriodsQuery', () => {
  it('parses a comma-separated period query', () => {
    expect(parsePeriodsQuery('2026-07,2026-06')).toEqual([
      '2026-07',
      '2026-06',
    ]);
  });

  it('parses repeated period query parameters', () => {
    expect(parsePeriodsQuery(['2026-07', '2026-06'])).toEqual([
      '2026-07',
      '2026-06',
    ]);
  });

  it('returns undefined when no valid period is provided', () => {
    expect(parsePeriodsQuery(undefined)).toBeUndefined();
    expect(parsePeriodsQuery('')).toBeUndefined();
  });
});

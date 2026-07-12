import { assertBatchSize } from '../../server/common/utils/batch';

describe('assertBatchSize', () => {
  it('rejects empty batch operations', () => {
    expect(() => assertBatchSize([], '实例')).toThrow('实例不能为空');
  });

  it('rejects oversized batch operations', () => {
    const ids = Array.from({ length: 101 }, (_, index) => String(index));
    expect(() => assertBatchSize(ids, '实例', 100)).toThrow(
      '实例数量不能超过 100',
    );
  });

  it('allows batch operations at the limit', () => {
    const ids = Array.from({ length: 100 }, (_, index) => String(index));
    expect(() => assertBatchSize(ids, '实例', 100)).not.toThrow();
  });
});

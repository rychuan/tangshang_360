import {
  validateRatingsAgainstSnapshots,
  type RatingValidationInput,
  type SnapshotValidationInput,
} from '../../server/modules/assessment-operation/assessment-operation.service';

describe('validateRatingsAgainstSnapshots', () => {
  const snapshots: SnapshotValidationInput[] = [
    { id: 'indicator-a', weight: '20', content: '业绩达成' },
    { id: 'indicator-b', weight: '30', content: '协作质量' },
  ];

  it('allows scores greater than the indicator weight', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 21 },
      { indicatorSnapshotId: 'indicator-b', score: 30 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, false),
    ).not.toThrow();
  });

  it('rejects missing ratings on final submit', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, false),
    ).toThrow('以下指标未评分');
  });

  it('allows partial ratings when saving a draft', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, true),
    ).not.toThrow();
  });

  it('allows draft ratings without scores', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', completionStatus: '已完成' },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, true),
    ).not.toThrow();
  });

  it('rejects final submitted ratings without scores', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
      { indicatorSnapshotId: 'indicator-b' },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, false),
    ).toThrow('以下指标未评分');
  });

  it('requires completion status when employee submits final self-review', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20, completionStatus: '' },
      { indicatorSnapshotId: 'indicator-b', score: 30, completionStatus: '完成' },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, snapshots, false, {
        requireCompletionStatus: true,
      }),
    ).toThrow('以下指标未填写完成情况');
  });

  // === 加减分维度（is_bonus 快照行）规则 ===

  const bonusSnapshots: SnapshotValidationInput[] = [
    ...snapshots,
    { id: 'bonus-1', weight: '0', content: '加减分项', isBonus: true },
  ];

  it('allows negative scores on bonus snapshots', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
      { indicatorSnapshotId: 'indicator-b', score: 30 },
      { indicatorSnapshotId: 'bonus-1', score: -5 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, bonusSnapshots, false),
    ).not.toThrow();
  });

  it('still rejects negative scores on normal indicators', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: -1 },
      { indicatorSnapshotId: 'indicator-b', score: 30 },
      { indicatorSnapshotId: 'bonus-1', score: 5 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, bonusSnapshots, false),
    ).toThrow('评分不能为负数');
  });

  it('does not require bonus snapshots on final submit', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
      { indicatorSnapshotId: 'indicator-b', score: 30 },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, bonusSnapshots, false),
    ).not.toThrow();
  });

  it('does not require completion status on bonus snapshots for self-review', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20, completionStatus: '完成' },
      { indicatorSnapshotId: 'indicator-b', score: 30, completionStatus: '完成' },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, bonusSnapshots, false, {
        requireCompletionStatus: true,
      }),
    ).not.toThrow();
  });

  it('rejects non-finite scores on bonus snapshots', () => {
    const ratings: RatingValidationInput[] = [
      { indicatorSnapshotId: 'indicator-a', score: 20 },
      { indicatorSnapshotId: 'indicator-b', score: 30 },
      { indicatorSnapshotId: 'bonus-1', score: Number.NaN },
    ];

    expect(() =>
      validateRatingsAgainstSnapshots(ratings, bonusSnapshots, false),
    ).toThrow('评分必须为有效数值');
  });
});

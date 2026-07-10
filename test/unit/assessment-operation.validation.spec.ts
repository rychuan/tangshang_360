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
});

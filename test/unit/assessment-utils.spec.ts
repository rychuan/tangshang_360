import {
  exceedsScoreCoefficient,
  getScoreCoefficientWarnings,
  type DimensionGroup,
  type RatingsState,
} from '../../client/src/pages/AssessmentDetail/assessment-utils';

describe('assessment score coefficient warnings', () => {
  const groups: DimensionGroup[] = [
    {
      dimensionName: '业绩',
      dimensionWeight: 100,
      indicators: [
        {
          id: 'indicator-a',
          dimensionName: '业绩',
          dimensionWeight: 100,
          content: '业绩达成',
          description: '',
          algorithm: '',
          dataSource: '',
          weight: 20,
        },
        {
          id: 'indicator-b',
          dimensionName: '业绩',
          dimensionWeight: 100,
          content: '客户满意度',
          description: '',
          algorithm: '',
          dataSource: '',
          weight: 10,
        },
      ],
    },
  ];

  it('uses weight score multiplied by 1.2 as the warning standard', () => {
    expect(exceedsScoreCoefficient(24, 20)).toBe(false);
    expect(exceedsScoreCoefficient(24.01, 20)).toBe(true);
  });

  it('detects warnings from the current rating score, not another score column', () => {
    const ratings: RatingsState = {
      'indicator-a': {
        score: 24.01,
        completionStatus: '',
        comment: '',
      },
      'indicator-b': {
        score: 11,
        completionStatus: '',
        comment: '',
      },
    };

    expect(getScoreCoefficientWarnings(ratings, groups)).toEqual(['业绩达成']);
  });
});

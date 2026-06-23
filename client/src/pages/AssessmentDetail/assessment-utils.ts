import type { AssessmentIndicatorDetail } from '@shared/api.interface';

export interface RatingsState {
  [indicatorSnapshotId: string]: {
    score: number;
    comment: string;
  };
}

export interface DimensionGroup {
  dimensionName: string;
  dimensionWeight: number;
  indicators: AssessmentIndicatorDetail[];
}

export function buildRatingPayload(ratings: RatingsState) {
  return {
    ratings: Object.entries(ratings).map(
      ([indicatorSnapshotId, r]) => ({
        indicatorSnapshotId,
        score: r.score,
        comment: r.comment || undefined,
      }),
    ),
  };
}

export function calculatePreviewScore(
  ratings: RatingsState,
  groups: DimensionGroup[],
): { score: number; grade: string } | null {
  let totalScore = 0;
  let hasAnyScore = false;

  for (const group of groups) {
    for (const ind of group.indicators) {
      const score = ratings[ind.id]?.score ?? 0;
      totalScore += score;
      if (score > 0) hasAnyScore = true;
    }
  }

  if (!hasAnyScore) return null;

  const score = Math.round(totalScore * 100) / 100;
  let grade: string;
  if (score >= 90) grade = 'S';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';
  else grade = 'D';

  return { score, grade };
}

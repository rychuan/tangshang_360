import type {
  AssessmentIndicatorDetail,
  ActiveGradeRule,
} from '@shared/api.interface';

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
    ratings: Object.entries(ratings).map(([indicatorSnapshotId, r]) => ({
      indicatorSnapshotId,
      score: r.score,
      comment: r.comment || undefined,
    })),
  };
}

/** 根据后端配置的等级规则匹配分数对应的等级名称 */
export function matchGradeLocally(
  totalScore: number,
  rules: ActiveGradeRule[],
): string {
  for (const rule of rules) {
    if (totalScore >= rule.minScore && totalScore <= rule.maxScore) {
      return rule.name;
    }
  }
  return 'D';
}

export function calculatePreviewScore(
  ratings: RatingsState,
  groups: DimensionGroup[],
  gradeRules: ActiveGradeRule[],
): { score: number; grade: string } | null {
  let totalScore = 0;
  let hasAnyEdit = false;

  for (const group of groups) {
    for (const ind of group.indicators) {
      const rating = ratings[ind.id];
      const score = rating?.score ?? 0;
      totalScore += score;
      // 使用 !== undefined 区分「评了 0 分」和「未评分」
      if (rating?.score !== undefined && rating.score !== null) {
        hasAnyEdit = true;
      }
    }
  }

  if (!hasAnyEdit) return null;

  const score = Math.round(totalScore * 100) / 100;
  const grade = matchGradeLocally(score, gradeRules);

  return { score, grade };
}

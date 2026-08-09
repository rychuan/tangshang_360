import type {
  AssessmentIndicatorDetail,
  ActiveGradeRule,
} from '@shared/api.interface';

export interface RatingsState {
  [indicatorSnapshotId: string]: {
    score?: number;
    completionStatus: string;
    comment: string;
  };
}

export interface DimensionGroup {
  dimensionName: string;
  dimensionWeight: number;
  /** 加减分维度（无指标、整体评分、支持负分） */
  isBonus: boolean;
  indicators: AssessmentIndicatorDetail[];
}

export function exceedsScoreCoefficient(
  score: number | null | undefined,
  weight: number,
  coefficient = 1.2,
): boolean {
  return score != null && score > weight * coefficient;
}

export function getScoreCoefficientWarnings(
  ratings: RatingsState,
  groups: DimensionGroup[],
): string[] {
  const warnings: string[] = [];
  for (const group of groups) {
    // 加减分维度无权重系数概念，跳过系数警告
    if (group.isBonus) continue;
    for (const ind of group.indicators) {
      const score = ratings[ind.id]?.score;
      if (exceedsScoreCoefficient(score, ind.weight)) {
        warnings.push(
          ind.content.length > 12
            ? ind.content.slice(0, 12) + '…'
            : ind.content,
        );
      }
    }
  }
  return warnings;
}

export function buildRatingPayload(ratings: RatingsState) {
  return {
    ratings: Object.entries(ratings).map(([indicatorSnapshotId, r]) => ({
      indicatorSnapshotId,
      score: r?.score,
      completionStatus: r?.completionStatus,
      comment: r?.comment || undefined,
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
  return '未评级';
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

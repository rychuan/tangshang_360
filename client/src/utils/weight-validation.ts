/**
 * Shared weight validation utilities for assessment templates.
 * Validates that:
 * 1. Dimension weights sum to 100 (excluding bonus dimensions)
 * 2. Indicator weights within each dimension sum to the dimension weight (excluding bonus dimensions)
 *
 * 加减分维度（isBonus）不参与权重 100% 校验：无指标、权重固定 0，
 * 评分支持负分且直接加入总分，因此从权重校验中排除。
 */

export interface IndicatorWeightError {
  dimensionName: string;
  dimensionWeight: number;
  indicatorSum: number;
}

export interface TotalWeightValidation {
  totalWeight: number;
  isValid: boolean;
}

export interface IndicatorWeightsValidation {
  isValid: boolean;
  errors: IndicatorWeightError[];
}

/**
 * Validate that the sum of all (non-bonus) dimension weights equals 100.
 */
export function validateTotalWeight(
  dimensions: Array<{ weight?: number; isBonus?: boolean }>,
): TotalWeightValidation {
  const normalDimensions = dimensions.filter((d) => !d.isBonus);
  const totalWeight = normalDimensions.reduce(
    (sum, d) => sum + (d.weight ?? 0),
    0,
  );
  return {
    totalWeight,
    isValid: Math.abs(totalWeight - 100) < 0.01,
  };
}

/**
 * Validate that for each (non-bonus) dimension, the sum of its indicator weights equals the dimension weight.
 */
export function validateIndicatorWeights(
  dimensions: Array<{
    name?: string;
    weight?: number;
    indicators?: Array<{ weight?: number }>;
    isBonus?: boolean;
  }>,
): IndicatorWeightsValidation {
  const errors: IndicatorWeightError[] = [];
  for (const dim of dimensions) {
    if (dim.isBonus) continue;
    const dimWeight = dim.weight ?? 0;
    const indicatorSum = (dim.indicators ?? []).reduce(
      (sum, ind) => sum + (ind.weight ?? 0),
      0,
    );
    if (Math.abs(indicatorSum - dimWeight) > 0.01) {
      errors.push({
        dimensionName: dim.name || '未分组',
        dimensionWeight: dimWeight,
        indicatorSum,
      });
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

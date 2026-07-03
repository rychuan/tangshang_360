/**
 * Shared weight validation utilities for assessment templates.
 * Validates that:
 * 1. Dimension weights sum to 100
 * 2. Indicator weights within each dimension sum to the dimension weight
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
 * Validate that the sum of all dimension weights equals 100.
 */
export function validateTotalWeight(
  dimensions: Array<{ weight?: number }>,
): TotalWeightValidation {
  const totalWeight = dimensions.reduce(
    (sum, d) => sum + (d.weight ?? 0),
    0,
  );
  return {
    totalWeight,
    isValid: Math.abs(totalWeight - 100) < 0.01,
  };
}

/**
 * Validate that for each dimension, the sum of its indicator weights equals the dimension weight.
 */
export function validateIndicatorWeights(
  dimensions: Array<{
    name?: string;
    weight?: number;
    indicators?: Array<{ weight?: number }>;
  }>,
): IndicatorWeightsValidation {
  const errors: IndicatorWeightError[] = [];
  for (const dim of dimensions) {
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

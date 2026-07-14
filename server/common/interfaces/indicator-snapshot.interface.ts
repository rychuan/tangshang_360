export interface IndicatorSnapshotFields {
  dimensionName: string;
  dimensionWeight: number;
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number;
  isAdjusted: boolean;
  adjustedBy: string | null;
  adjustedAt: string | null;
  sortOrder: number;
}

export function mapToSnapshotFields(row: {
  dimensionName: string;
  dimensionWeight: string | number;
  content: string;
  description: string | null;
  algorithm: string | null;
  dataSource: string | null;
  weight: string | number;
  isAdjusted: boolean | null;
  adjustedBy: string | null;
  adjustedAt: Date | string | null;
  sortOrder: number | null;
}): IndicatorSnapshotFields {
  return {
    dimensionName: row.dimensionName,
    dimensionWeight: Number(row.dimensionWeight || 0),
    content: row.content,
    description: row.description || '',
    algorithm: row.algorithm || '',
    dataSource: row.dataSource || '',
    weight: Number(row.weight || 0),
    isAdjusted: row.isAdjusted ?? false,
    adjustedBy: row.adjustedBy ?? null,
    adjustedAt: row.adjustedAt
      ? row.adjustedAt instanceof Date
        ? row.adjustedAt.toISOString()
        : String(row.adjustedAt)
      : null,
    sortOrder: row.sortOrder ?? 0,
  };
}

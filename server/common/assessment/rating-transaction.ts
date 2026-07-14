import { and, eq, inArray } from 'drizzle-orm';
import { ratingRecord } from '@server/database/schema';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';

export interface RatingUpsertItem {
  indicatorSnapshotId: string;
  score?: number | null;
  completionStatus?: string;
  comment?: string;
}

/**
 * 在事务内执行评分记录的批量 upsert（update existing or insert new）。
 * 提取自 assessment-operation.service.ts 中 4 处重复的评分写入逻辑。
 *
 * @param tx - Drizzle 事务对象
 * @param _db - 数据库实例（仅用于类型推断，实际查询走 tx）
 * @returns 评分映射（snapshotId → score），供调用方计算总分
 */
export async function upsertRatingsInTx(
  tx: any,
  _db: PostgresJsDatabase,
  params: {
    instanceId: string;
    ratingType: 'self' | 'supervisor';
    ratings: RatingUpsertItem[];
    isDraft: boolean;
    ratedBy: string;
    submittedAt?: Date | null;
    /** 额外写入 ratingRecord 的字段生成器 */
    extraFields?: (rating: RatingUpsertItem) => Record<string, unknown>;
  },
): Promise<Map<string, number>> {
  const snapshotIds = params.ratings.map((r) => r.indicatorSnapshotId);
  const existingList = await tx
    .select()
    .from(ratingRecord)
    .where(
      and(
        eq(ratingRecord.instanceId, params.instanceId),
        eq(ratingRecord.ratingType, params.ratingType),
        inArray(ratingRecord.indicatorSnapshotId, snapshotIds),
      ),
    );

  const existingMap = new Map(
    existingList.map((r: any) => [r.indicatorSnapshotId, r]),
  );

  const ratingBySnapId = new Map<string, number>();

  for (const rating of params.ratings) {
    const existingRow = existingMap.get(rating.indicatorSnapshotId);
    const scoreStr: string | null =
      rating.score == null ? null : String(rating.score);

    if (rating.score != null) {
      ratingBySnapId.set(rating.indicatorSnapshotId, rating.score);
    }

    const submittedAt =
      params.submittedAt !== undefined
        ? params.submittedAt
        : params.isDraft
          ? null
          : new Date();

    const extra = params.extraFields ? params.extraFields(rating) : {};

    if (existingRow) {
      await tx
        .update(ratingRecord)
        .set({
          score: scoreStr,
          comment: rating.comment || null,
          isDraft: params.isDraft,
          submittedAt,
          ...extra,
        })
        .where(eq(ratingRecord.id, (existingRow as any).id));
    } else {
      await tx.insert(ratingRecord).values({
        instanceId: params.instanceId,
        indicatorSnapshotId: rating.indicatorSnapshotId,
        ratingType: params.ratingType,
        score: scoreStr,
        comment: rating.comment || null,
        ratedBy: params.ratedBy,
        isDraft: params.isDraft,
        submittedAt,
        ...extra,
      });
    }
  }

  return ratingBySnapId;
}

/**
 * 根据快照和评分映射计算加权总分。
 */
export function calculateTotalScore(
  ratingBySnapId: Map<string, number>,
  snapshots: Array<{ id: string; weight: string | number }>,
): number {
  let totalScore = 0;
  for (const snap of snapshots) {
    totalScore += ratingBySnapId.get(snap.id) ?? 0;
  }
  return Math.round(totalScore * 100) / 100;
}

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, asc, and } from 'drizzle-orm';
import {
  employeeIndicatorSnapshot,
  assessmentIndicatorSnapshot,
  assessmentDimension,
  assessmentIndicator,
  assessmentTemplate,
  employeeBinding,
} from '@server/database/schema';
import type {
  EmployeeSnapshotResponse,
  InstanceIndicatorItem,
  AdjustIndicatorInput,
} from '@shared/api.interface';

@Injectable()
export class EmployeeSnapshotService {
  private readonly logger: Logger = new Logger(EmployeeSnapshotService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async generateFromTemplate(
    employeeId: string,
    templateId: string,
    userId: string,
    tx?: PostgresJsDatabase,
  ): Promise<void> {
    const db = tx ?? this.db;
    this.logger.log(
      `generateFromTemplate employeeId=${employeeId} templateId=${templateId}`,
    );

    const dimensionRows = await db
      .select()
      .from(assessmentDimension)
      .where(eq(assessmentDimension.templateId, templateId))
      .orderBy(asc(assessmentDimension.sortOrder));

    const dimensionMap: Map<string, { name: string; weight: number }> =
      new Map();
    for (const d of dimensionRows) {
      dimensionMap.set(d.id, { name: d.name, weight: Number(d.weight) });
    }

    const indicators = await db
      .select()
      .from(assessmentIndicator)
      .innerJoin(
        assessmentDimension,
        eq(assessmentIndicator.dimensionId, assessmentDimension.id),
      )
      .where(eq(assessmentDimension.templateId, templateId))
      .orderBy(
        asc(assessmentDimension.sortOrder),
        asc(assessmentIndicator.sortOrder),
      );

    if (indicators.length > 0 || dimensionRows.some((d) => d.isBonus)) {
      const snapshotValues = [
        // 普通维度：每个指标一行快照
        ...indicators.map((ind: (typeof indicators)[number], i: number) => {
          const dim = dimensionMap.get(ind.assessment_indicator.dimensionId);
          return {
            employeeId,
            templateId,
            dimensionName: dim?.name ?? '',
            dimensionWeight: String(dim?.weight ?? 0),
            content: ind.assessment_indicator.content,
            description: ind.assessment_indicator.description,
            algorithm: ind.assessment_indicator.algorithm,
            dataSource: ind.assessment_indicator.dataSource,
            weight: ind.assessment_indicator.weight,
            isBonus: false,
            isAdjusted: false,
            sortOrder: i,
            createdBy: userId,
            updatedBy: userId,
          };
        }),
        // 加减分维度：每个维度一行维度级快照（无指标，整体评分）
        ...dimensionRows
          .filter((d) => d.isBonus)
          .map((dim, j) => ({
            employeeId,
            templateId,
            dimensionName: dim.name,
            dimensionWeight: '0',
            content: dim.name,
            description: dim.description,
            algorithm: null,
            dataSource: null,
            weight: '0',
            isBonus: true,
            isAdjusted: false,
            sortOrder: indicators.length + j,
            createdBy: userId,
            updatedBy: userId,
          })),
      ];
      await db.insert(employeeIndicatorSnapshot).values(snapshotValues);
    }
  }

  async getSnapshot(employeeId: string): Promise<EmployeeSnapshotResponse> {
    this.logger.log(`getSnapshot employeeId=${employeeId}`);

    const bindingRows = await this.db
      .select({
        templateId: employeeBinding.templateId,
        templateName: assessmentTemplate.name,
      })
      .from(employeeBinding)
      .innerJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .where(
        and(
          eq(employeeBinding.employeeId, employeeId),
          eq(employeeBinding.status, true),
        ),
      )
      .limit(1);

    const templateId: string = bindingRows[0]?.templateId ?? '';
    const templateName: string = bindingRows[0]?.templateName ?? '';

    const snapshotRows = await this.db
      .select()
      .from(employeeIndicatorSnapshot)
      .where(eq(employeeIndicatorSnapshot.employeeId, employeeId))
      .orderBy(asc(employeeIndicatorSnapshot.sortOrder));

    if (snapshotRows.length > 0) {
      const indicators: InstanceIndicatorItem[] = snapshotRows.map(
        (row: (typeof snapshotRows)[number]) => ({
          content: row.content,
          description: row.description ?? '',
          algorithm: row.algorithm ?? '',
          dataSource: row.dataSource ?? '',
          weight: Number(row.weight),
          dimensionName: row.dimensionName,
          dimensionWeight: Number(row.dimensionWeight),
          isBonus: row.isBonus ?? false,
        }),
      );
      return { indicators, hasSnapshot: true, templateId, templateName };
    }

    if (!templateId) {
      return {
        indicators: [],
        hasSnapshot: false,
        templateId: '',
        templateName: '',
      };
    }

    const dimensionRows = await this.db
      .select()
      .from(assessmentDimension)
      .where(eq(assessmentDimension.templateId, templateId))
      .orderBy(asc(assessmentDimension.sortOrder));

    const dimensionMap: Map<string, { name: string; weight: number }> =
      new Map();
    for (const d of dimensionRows) {
      dimensionMap.set(d.id, { name: d.name, weight: Number(d.weight) });
    }

    const indicatorsForTemplate = await this.db
      .select()
      .from(assessmentIndicator)
      .innerJoin(
        assessmentDimension,
        eq(assessmentIndicator.dimensionId, assessmentDimension.id),
      )
      .where(eq(assessmentDimension.templateId, templateId))
      .orderBy(
        asc(assessmentDimension.sortOrder),
        asc(assessmentIndicator.sortOrder),
      );

    const indicators: InstanceIndicatorItem[] = [
      // 普通维度：每个指标一行
      ...indicatorsForTemplate.map(
        (ind: (typeof indicatorsForTemplate)[number]) => {
          const dim = dimensionMap.get(ind.assessment_indicator.dimensionId);
          return {
            content: ind.assessment_indicator.content,
            description: ind.assessment_indicator.description ?? '',
            algorithm: ind.assessment_indicator.algorithm ?? '',
            dataSource: ind.assessment_indicator.dataSource ?? '',
            weight: Number(ind.assessment_indicator.weight),
            dimensionName: dim?.name ?? '',
            dimensionWeight: dim?.weight ?? 0,
            isBonus: false,
          };
        },
      ),
      // 加减分维度：每个维度一行（整体评分）
      ...dimensionRows
        .filter((d) => d.isBonus)
        .map((dim) => ({
          content: dim.name,
          description: dim.description ?? '',
          algorithm: '',
          dataSource: '',
          weight: 0,
          dimensionName: dim.name,
          dimensionWeight: 0,
          isBonus: true,
        })),
    ];

    return { indicators, hasSnapshot: false, templateId, templateName };
  }

  async adjustSnapshot(
    employeeId: string,
    templateId: string,
    indicators: AdjustIndicatorInput[],
    userId: string,
    tx?: PostgresJsDatabase,
  ): Promise<{ success: boolean }> {
    if (tx) {
      return this._adjustSnapshot(
        employeeId,
        templateId,
        indicators,
        userId,
        tx,
      );
    }
    return this.db.transaction((innerTx: any) =>
      this._adjustSnapshot(employeeId, templateId, indicators, userId, innerTx),
    );
  }

  private async _adjustSnapshot(
    employeeId: string,
    templateId: string,
    indicators: AdjustIndicatorInput[],
    userId: string,
    db: any,
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `adjustSnapshot employeeId=${employeeId} templateId=${templateId}`,
    );

    const dimWeightMap: Map<string, number> = new Map();
    for (const ind of indicators) {
      if (ind.isBonus) continue;
      const key: string = ind.dimensionName || '未分组';
      if (!dimWeightMap.has(key)) {
        dimWeightMap.set(key, ind.dimensionWeight ?? 0);
      }
    }
    const dimWeightSum: number = Array.from(dimWeightMap.values()).reduce(
      (sum: number, w) => sum + w,
      0,
    );
    if (Math.abs(dimWeightSum - 100) > 0.01) {
      throw new BadRequestException(
        `维度权重之和必须等于 100，当前为 ${dimWeightSum}`,
      );
    }

    // 校验每个维度内指标权重之和等于该维度权重（加减分维度除外）
    const dimIndicatorSum: Map<string, number> = new Map();
    for (const ind of indicators) {
      if (ind.isBonus) continue;
      const dimKey = ind.dimensionName || '未分组';
      dimIndicatorSum.set(
        dimKey,
        (dimIndicatorSum.get(dimKey) || 0) + (ind.weight ?? 0),
      );
    }
    for (const [dimName, indicatorSum] of dimIndicatorSum) {
      const dimWeight = dimWeightMap.get(dimName) ?? 0;
      if (Math.abs(indicatorSum - dimWeight) > 0.01) {
        throw new BadRequestException(
          `维度「${dimName}」的指标权重之和(${Math.round(indicatorSum * 100) / 100})不等于维度权重(${dimWeight})`,
        );
      }
    }

    const dimRows = await db
      .select()
      .from(assessmentDimension)
      .where(eq(assessmentDimension.templateId, templateId))
      .orderBy(asc(assessmentDimension.sortOrder));

    await db
      .delete(employeeIndicatorSnapshot)
      .where(eq(employeeIndicatorSnapshot.employeeId, employeeId));

    const now: Date = new Date();
    for (let i: number = 0; i < indicators.length; i++) {
      const ind = indicators[i];
      const dimName: string =
        ind.dimensionName || (dimRows.length > 0 ? dimRows[0].name : '调整项');
      const dimWeight: number =
        ind.dimensionWeight ??
        (dimRows.length > 0 ? Number(dimRows[0].weight) : 0);
      // 加减分维度快照行：权重固定 0（不参与权重校验与计算），防异常入参
      const isBonus = ind.isBonus ?? false;
      await db.insert(employeeIndicatorSnapshot).values({
        employeeId,
        templateId,
        dimensionName: dimName,
        dimensionWeight: String(isBonus ? 0 : dimWeight),
        content: ind.content,
        description: ind.description,
        algorithm: ind.algorithm,
        dataSource: ind.dataSource,
        weight: String(isBonus ? 0 : ind.weight),
        isBonus,
        isAdjusted: true,
        adjustedBy: userId,
        adjustedAt: now,
        sortOrder: i,
        createdBy: userId,
        updatedBy: userId,
      });
    }

    return { success: true };
  }

  async deleteSnapshot(
    employeeId: string,
    tx?: PostgresJsDatabase,
  ): Promise<{ success: boolean }> {
    const db = tx ?? this.db;
    this.logger.log(`deleteSnapshot employeeId=${employeeId}`);

    await db
      .delete(employeeIndicatorSnapshot)
      .where(eq(employeeIndicatorSnapshot.employeeId, employeeId));

    return { success: true };
  }

  async copyToInstance(
    employeeId: string,
    instanceId: string,
    tx?: PostgresJsDatabase,
  ): Promise<void> {
    const db = tx ?? this.db;
    this.logger.log(
      `copyToInstance employeeId=${employeeId} instanceId=${instanceId}`,
    );

    const snapshotRows = await db
      .select()
      .from(employeeIndicatorSnapshot)
      .where(eq(employeeIndicatorSnapshot.employeeId, employeeId))
      .orderBy(asc(employeeIndicatorSnapshot.sortOrder));

    if (snapshotRows.length > 0) {
      const snapshotValues = snapshotRows.map(
        (row: (typeof snapshotRows)[number]) => ({
          instanceId,
          dimensionName: row.dimensionName,
          dimensionWeight: row.dimensionWeight,
          content: row.content,
          description: row.description,
          algorithm: row.algorithm,
          dataSource: row.dataSource,
          weight: row.weight,
          isBonus: row.isBonus ?? false,
          isAdjusted: row.isAdjusted,
          adjustedBy: row.adjustedBy,
          adjustedAt: row.adjustedAt,
          sortOrder: row.sortOrder,
        }),
      );
      await db.insert(assessmentIndicatorSnapshot).values(snapshotValues);
    }
  }

  async hasSnapshot(
    employeeId: string,
    tx?: PostgresJsDatabase,
  ): Promise<boolean> {
    const db = tx ?? this.db;
    const rows = await db
      .select({ id: employeeIndicatorSnapshot.id })
      .from(employeeIndicatorSnapshot)
      .where(eq(employeeIndicatorSnapshot.employeeId, employeeId))
      .limit(1);
    return rows.length > 0;
  }
}

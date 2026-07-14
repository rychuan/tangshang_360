import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, like, count, desc, sql, inArray, isNull } from 'drizzle-orm';
import {
  assessmentTemplate,
  assessmentDimension,
  assessmentIndicator,
  employeeBinding,
  auditLog,
} from '@server/database/schema';
import type {
  AssessmentTemplateItem,
  AssessmentTemplateListResponse,
  AssessmentTemplateDetail,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

@Injectable()
export class AssessmentTemplateService {
  private readonly logger = new Logger(AssessmentTemplateService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(
    page: number,
    pageSize: number,
    keyword?: string,
    position?: string,
    status?: string,
  ): Promise<AssessmentTemplateListResponse> {
    this.logger.log(
      `list: page=${page}, pageSize=${pageSize}, keyword=${keyword}, position=${position}, status=${status}`,
    );

    const conditions: ReturnType<typeof eq>[] = [
      isNull(assessmentTemplate.deletedAt),
    ];

    if (keyword) {
      conditions.push(like(assessmentTemplate.name, `%${keyword}%`));
    }
    if (position) {
      conditions.push(eq(assessmentTemplate.position, position));
    }
    if (status === 'active') {
      conditions.push(eq(assessmentTemplate.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(assessmentTemplate.isActive, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    // 3.3: 列表增加维度和指标数量
    const items = await this.db
      .select({
        id: assessmentTemplate.id,
        name: assessmentTemplate.name,
        position: assessmentTemplate.position,
        type: assessmentTemplate.type,
        isActive: assessmentTemplate.isActive,
        createdAt: assessmentTemplate.createdAt,
        dimensionCount: sql<number>`CAST((SELECT COUNT(*) FROM assessment_dimension d WHERE d.template_id = ${assessmentTemplate.id}) AS INT)`,
        indicatorCount: sql<number>`CAST((SELECT COUNT(*) FROM assessment_indicator ind WHERE ind.dimension_id IN (SELECT d2.id FROM assessment_dimension d2 WHERE d2.template_id = ${assessmentTemplate.id})) AS INT)`,
      })
      .from(assessmentTemplate)
      .where(whereClause)
      .orderBy(desc(assessmentTemplate.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(assessmentTemplate)
      .where(whereClause);

    const mapped: AssessmentTemplateItem[] = items.map(
      (item: (typeof items)[number]) => ({
        id: item.id,
        name: item.name,
        position: item.position,
        type: item.type as AssessmentTemplateItem['type'],
        isActive: item.isActive,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : String(item.createdAt),
        dimensionCount: Number(item.dimensionCount),
        indicatorCount: Number(item.indicatorCount),
      }),
    );

    return {
      items: mapped,
      total: Number(totalResult?.count || 0),
    };
  }

  async detail(id: string): Promise<AssessmentTemplateDetail> {
    this.logger.log(`detail: id=${id}`);

    const templates = await this.db
      .select()
      .from(assessmentTemplate)
      .where(eq(assessmentTemplate.id, id))
      .limit(1);

    if (templates.length === 0) {
      throw new NotFoundException('模板不存在');
    }

    const tmpl = templates[0];

    const dimensions = await this.db
      .select()
      .from(assessmentDimension)
      .where(eq(assessmentDimension.templateId, id))
      .orderBy(assessmentDimension.sortOrder);

    const dimensionIds: string[] = dimensions.map(
      (d: (typeof dimensions)[number]) => d.id,
    );

    const indicators: (typeof assessmentIndicator.$inferSelect)[] =
      dimensionIds.length > 0
        ? await this.db
            .select()
            .from(assessmentIndicator)
            .where(inArray(assessmentIndicator.dimensionId, dimensionIds))
            .orderBy(assessmentIndicator.sortOrder)
        : [];

    const indicatorsByDim: Record<
      string,
      (typeof assessmentIndicator.$inferSelect)[]
    > = {};
    for (const ind of indicators) {
      if (!indicatorsByDim[ind.dimensionId]) {
        indicatorsByDim[ind.dimensionId] = [];
      }
      indicatorsByDim[ind.dimensionId].push(ind);
    }

    return {
      id: tmpl.id,
      name: tmpl.name,
      position: tmpl.position,
      type: tmpl.type as AssessmentTemplateDetail['type'],
      isActive: tmpl.isActive,
      dimensions: dimensions.map((dim: (typeof dimensions)[number]) => ({
        id: dim.id,
        name: dim.name,
        weight: Number(dim.weight),
        indicators: (indicatorsByDim[dim.id] || []).map(
          (ind: typeof assessmentIndicator.$inferSelect) => ({
            id: ind.id,
            content: ind.content,
            description: ind.description || '',
            algorithm: ind.algorithm || '',
            dataSource: ind.dataSource || '',
            weight: Number(ind.weight),
          }),
        ),
      })),
    };
  }

  async create(body: CreateTemplateRequest): Promise<CreateResponse> {
    this.logger.log(`create: ${JSON.stringify(body)}`);

    this.validateWeights(body.dimensions);

    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(assessmentTemplate)
        .values({
          name: body.name,
          position: body.position,
          type: body.type,
        })
        .returning({ id: assessmentTemplate.id });

      const templateId: string = inserted.id;

      for (let i = 0; i < body.dimensions.length; i++) {
        const dim = body.dimensions[i];
        const [dimInserted] = await tx
          .insert(assessmentDimension)
          .values({
            templateId,
            name: dim.name,
            weight: String(dim.weight),
            sortOrder: i,
          })
          .returning({ id: assessmentDimension.id });

        const dimensionId: string = dimInserted.id;

        for (let j = 0; j < dim.indicators.length; j++) {
          const ind = dim.indicators[j];
          await tx.insert(assessmentIndicator).values({
            dimensionId,
            content: ind.content,
            description: ind.description,
            algorithm: ind.algorithm,
            dataSource: ind.dataSource,
            weight: String(ind.weight),
            sortOrder: j,
          });
        }
      }

      return { id: templateId };
    });
  }

  async update(
    id: string,
    body: UpdateTemplateRequest,
  ): Promise<SuccessResponse> {
    this.logger.log(`update: id=${id}, ${JSON.stringify(body)}`);

    const templates = await this.db
      .select()
      .from(assessmentTemplate)
      .where(eq(assessmentTemplate.id, id))
      .limit(1);

    if (templates.length === 0) {
      throw new NotFoundException('模板不存在');
    }

    this.validateWeights(body.dimensions);

    const existingDims = await this.db
      .select({ id: assessmentDimension.id })
      .from(assessmentDimension)
      .where(eq(assessmentDimension.templateId, id));

    return this.db.transaction(async (tx) => {
      for (const dim of existingDims) {
        await tx
          .delete(assessmentIndicator)
          .where(eq(assessmentIndicator.dimensionId, dim.id));
      }

      await tx
        .delete(assessmentDimension)
        .where(eq(assessmentDimension.templateId, id));

      await tx
        .update(assessmentTemplate)
        .set({
          name: body.name,
          position: body.position,
          type: body.type,
        })
        .where(eq(assessmentTemplate.id, id));

      for (let i = 0; i < body.dimensions.length; i++) {
        const dim = body.dimensions[i];
        const [dimInserted] = await tx
          .insert(assessmentDimension)
          .values({
            templateId: id,
            name: dim.name,
            weight: String(dim.weight),
            sortOrder: i,
          })
          .returning({ id: assessmentDimension.id });

        const dimensionId: string = dimInserted.id;

        for (let j = 0; j < dim.indicators.length; j++) {
          const ind = dim.indicators[j];
          await tx.insert(assessmentIndicator).values({
            dimensionId,
            content: ind.content,
            description: ind.description,
            algorithm: ind.algorithm,
            dataSource: ind.dataSource,
            weight: String(ind.weight),
            sortOrder: j,
          });
        }
      }

      return { success: true };
    });
  }

  async deactivate(id: string): Promise<SuccessResponse> {
    this.logger.log(`deactivate: id=${id}`);

    const templates = await this.db
      .select()
      .from(assessmentTemplate)
      .where(eq(assessmentTemplate.id, id))
      .limit(1);

    if (templates.length === 0) {
      throw new NotFoundException('模板不存在');
    }

    await this.db
      .update(assessmentTemplate)
      .set({ isActive: false })
      .where(eq(assessmentTemplate.id, id));

    return { success: true };
  }

  async delete(id: string, userId: string): Promise<SuccessResponse> {
    this.logger.log(`delete: id=${id}`);

    const templates = await this.db
      .select()
      .from(assessmentTemplate)
      .where(
        and(
          eq(assessmentTemplate.id, id),
          isNull(assessmentTemplate.deletedAt),
        ),
      )
      .limit(1);

    if (templates.length === 0) {
      throw new NotFoundException('模板不存在');
    }

    // 级联停用关联的绑定关系
    await this.db
      .update(employeeBinding)
      .set({ status: false })
      .where(eq(employeeBinding.templateId, id));

    // 软删除模板
    await this.db
      .update(assessmentTemplate)
      .set({ deletedAt: new Date() })
      .where(eq(assessmentTemplate.id, id));

    // 审计日志
    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'delete_template',
      targetType: 'assessment_template',
      targetId: id,
      changes: { before: { name: templates[0].name } },
    });

    this.logger.log(`Template deleted: ${templates[0].name} (${id})`);

    return { success: true };
  }

  private validateWeights(
    dimensions: CreateTemplateRequest['dimensions'],
  ): void {
    const weightSum: number = dimensions.reduce(
      (sum: number, d) => sum + d.weight,
      0,
    );

    if (Math.abs(weightSum - 100) > 0.01) {
      throw new BadRequestException(
        `维度权重之和必须等于 100，当前为 ${weightSum}`,
      );
    }

    for (const dim of dimensions) {
      const indicatorWeightSum: number = dim.indicators.reduce(
        (sum: number, ind) => sum + ind.weight,
        0,
      );

      if (Math.abs(indicatorWeightSum - dim.weight) > 0.01) {
        throw new BadRequestException(
          `维度「${dim.name}」的指标权重之和必须等于维度权重 ${dim.weight}，当前为 ${indicatorWeightSum}`,
        );
      }
    }
  }
}

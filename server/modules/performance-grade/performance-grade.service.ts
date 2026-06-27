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
import { eq } from 'drizzle-orm';
import { performanceGrade } from '@server/database/schema';
import type {
  PerformanceGradeItem,
  PerformanceGradeListResponse,
  CreatePerformanceGradeRequest,
  UpdatePerformanceGradeRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

interface GradeRuleForValidation {
  name: string;
  minScore: number;
  maxScore: number;
}

@Injectable()
export class PerformanceGradeService {
  private readonly logger = new Logger(PerformanceGradeService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(): Promise<PerformanceGradeListResponse> {
    this.logger.log('list');

    const items = await this.db
      .select()
      .from(performanceGrade)
      .orderBy(performanceGrade.sortOrder);

    const mapped: PerformanceGradeItem[] = items.map(
      (item: typeof items[number]) => ({
        id: item.id,
        name: item.name,
        minScore: item.minScore,
        maxScore: item.maxScore,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : String(item.createdAt),
      }),
    );

    return { items: mapped };
  }

  async create(body: CreatePerformanceGradeRequest): Promise<CreateResponse> {
    this.logger.log(`create: ${JSON.stringify(body)}`);

    const existing = await this.db
      .select()
      .from(performanceGrade)
      .where(eq(performanceGrade.isActive, true));

    const rules: GradeRuleForValidation[] = existing.map(
      (r: typeof existing[number]) => ({
        name: r.name,
        minScore: r.minScore,
        maxScore: r.maxScore,
      }),
    );

    if (body.isActive) {
      rules.push({
        name: body.name,
        minScore: body.minScore,
        maxScore: body.maxScore,
      });
    }

    this.validateGradeRules(rules);

    const [inserted] = await this.db
      .insert(performanceGrade)
      .values({
        name: body.name,
        minScore: body.minScore,
        maxScore: body.maxScore,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      })
      .returning({ id: performanceGrade.id });

    return { id: inserted.id };
  }

  async update(
    id: string,
    body: UpdatePerformanceGradeRequest,
  ): Promise<SuccessResponse> {
    this.logger.log(`update: id=${id}, ${JSON.stringify(body)}`);

    const targets = await this.db
      .select()
      .from(performanceGrade)
      .where(eq(performanceGrade.id, id))
      .limit(1);

    if (targets.length === 0) {
      throw new NotFoundException('等级配置不存在');
    }

    const allActive = await this.db
      .select()
      .from(performanceGrade)
      .where(eq(performanceGrade.isActive, true));

    const rules: GradeRuleForValidation[] = allActive
      .filter((r: typeof allActive[number]) => r.id !== id)
      .map((r: typeof allActive[number]) => ({
        name: r.name,
        minScore: r.minScore,
        maxScore: r.maxScore,
      }));

    if (body.isActive) {
      rules.push({
        name: body.name,
        minScore: body.minScore,
        maxScore: body.maxScore,
      });
    }

    this.validateGradeRules(rules);

    await this.db
      .update(performanceGrade)
      .set({
        name: body.name,
        minScore: body.minScore,
        maxScore: body.maxScore,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      })
      .where(eq(performanceGrade.id, id));

    return { success: true };
  }

  async remove(id: string): Promise<SuccessResponse> {
    this.logger.log(`remove: id=${id}`);

    const targets = await this.db
      .select()
      .from(performanceGrade)
      .where(eq(performanceGrade.id, id))
      .limit(1);

    if (targets.length === 0) {
      throw new NotFoundException('等级配置不存在');
    }

    await this.db
      .delete(performanceGrade)
      .where(eq(performanceGrade.id, id));

    return { success: true };
  }

  async matchGrade(totalScore: number): Promise<string> {
    this.logger.log(`matchGrade: totalScore=${totalScore}`);

    const rules = await this.db
      .select()
      .from(performanceGrade)
      .where(eq(performanceGrade.isActive, true));

    for (const rule of rules) {
      if (totalScore >= rule.minScore && totalScore <= rule.maxScore) {
        return rule.name;
      }
    }

    return 'D';
  }

  private validateGradeRules(rules: GradeRuleForValidation[]): void {
    if (rules.length === 0) {
      throw new BadRequestException(
        '至少需要一条启用的等级规则以覆盖0-100区间',
      );
    }

    for (const rule of rules) {
      if (rule.minScore >= rule.maxScore) {
        throw new BadRequestException(
          `等级「${rule.name}」的最低分(${rule.minScore})必须小于最高分(${rule.maxScore})`,
        );
      }
    }

    const sorted = [...rules].sort(
      (a: GradeRuleForValidation, b: GradeRuleForValidation) =>
        a.minScore - b.minScore,
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (curr.maxScore >= next.minScore) {
        throw new BadRequestException(
          `等级「${curr.name}」(区间[${curr.minScore},${curr.maxScore}])与等级「${next.name}」(区间[${next.minScore},${next.maxScore}])分数区间重叠`,
        );
      }
      if (curr.maxScore + 1 < next.minScore) {
        throw new BadRequestException(
          `等级「${curr.name}」(最高分${curr.maxScore})与等级「${next.name}」(最低分${next.minScore})之间存在未覆盖的分数区间`,
        );
      }
    }

    const firstMin = sorted[0].minScore;
    if (firstMin !== 0) {
      throw new BadRequestException(
        `最低等级的最低分应为0，当前为${firstMin}，未完整覆盖0-100区间`,
      );
    }

    const lastMax = sorted[sorted.length - 1].maxScore;
    if (lastMax < 100) {
      throw new BadRequestException(
        `最高等级的最高分应至少为100，当前为${lastMax}，未完整覆盖0-100区间`,
      );
    }
  }
}

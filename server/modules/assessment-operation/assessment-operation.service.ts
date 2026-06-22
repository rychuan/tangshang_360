import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, sql, isNull } from 'drizzle-orm';
import {
  assessmentInstance,
  assessmentIndicatorSnapshot,
  ratingRecord,
  auditLog,
  employee,
} from '@server/database/schema';
import { PerformanceGradeService } from '../performance-grade/performance-grade.service';
import type {
  AssessmentInstanceDetail,
  AssessmentIndicatorDetail,
  RatingSubmitRequest,
  SignRequest,
  SupervisorRatingResponse,
} from '@shared/api.interface';

@Injectable()
export class AssessmentOperationService {
  private readonly logger = new Logger(AssessmentOperationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly performanceGradeService: PerformanceGradeService,
  ) {}

  async detail(id: string): Promise<AssessmentInstanceDetail> {
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    const empRows = await this.db
      .select({ name: employee.name })
      .from(employee)
      .where(and(eq(employee.id, instance.employeeId), isNull(employee.deletedAt)))
      .limit(1);
    const employeeName: string =
      empRows.length > 0 ? empRows[0].name : '';

    let supervisorName: string = '';
    if (instance.supervisorId) {
      const supRows = await this.db
        .select({ name: employee.name })
        .from(employee)
        .where(and(eq(employee.id, instance.supervisorId), isNull(employee.deletedAt)))
        .limit(1);
      supervisorName = supRows.length > 0 ? supRows[0].name : '';
    }

    const snapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id))
      .orderBy(assessmentIndicatorSnapshot.sortOrder);

    const allRatings = await this.db
      .select()
      .from(ratingRecord)
      .where(eq(ratingRecord.instanceId, id));

    const ratingMap = new Map<
      string,
      { score: number; comment?: string | null }
    >();
    for (const r of allRatings) {
      const key = `${r.indicatorSnapshotId}:${r.ratingType}`;
      ratingMap.set(key, {
        score: Number(r.score),
        comment: r.comment,
      });
    }

    const indicators: AssessmentIndicatorDetail[] = snapshots.map(
      (snap) => {
        const selfRating = ratingMap.get(`${snap.id}:self`);
        const supervisorRating = ratingMap.get(
          `${snap.id}:supervisor`,
        );

        return {
          id: snap.id,
          dimensionName: snap.dimensionName,
          dimensionWeight: Number(snap.dimensionWeight),
          content: snap.content,
          description: snap.description || '',
          algorithm: snap.algorithm || '',
          dataSource: snap.dataSource || '',
          maxScore: Number(snap.maxScore),
          selfScore: selfRating?.score,
          selfComment: selfRating?.comment || undefined,
          supervisorScore: supervisorRating?.score,
          supervisorComment:
            supervisorRating?.comment || undefined,
        };
      },
    );

    return {
      id: instance.id,
      period: instance.period,
      employeeId: instance.employeeId,
      employeeName,
      position: instance.position,
      supervisorId: instance.supervisorId || '',
      supervisorName,
      status: instance.status,
      totalScore: instance.totalScore
        ? Number(instance.totalScore)
        : undefined,
      grade: instance.grade || undefined,
      selfSignName: instance.selfSignName || undefined,
      selfSignAt: instance.selfSignAt
        ? instance.selfSignAt.toISOString()
        : undefined,
      selfSignImage: instance.selfSignImage || undefined,
      supervisorSignName:
        instance.supervisorSignName || undefined,
      supervisorSignAt: instance.supervisorSignAt
        ? instance.supervisorSignAt.toISOString()
        : undefined,
      supervisorSignImage: instance.supervisorSignImage || undefined,
      indicators,
    };
  }

  async submitSelfRating(
    id: string,
    body: RatingSubmitRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // P0: 校验当前用户是否为该员工本人
    if (instance.employeeId !== userId) {
      throw new ForbiddenException('只能提交自己的自评');
    }

    // P0: 校验自评是否已提交，防止覆盖
    const submittedStatuses = ['supervisor_review', 'pending_sign', 'completed'];
    if (submittedStatuses.includes(instance.status)) {
      throw new BadRequestException('自评已提交，如需修改请联系管理员解锁');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    const snapshotMap = new Map(
      allSnapshots.map((s) => [s.id, s]),
    );

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score > Number(snapshot.maxScore)) {
        throw new BadRequestException(
          `评分不能超过最高分 ${snapshot.maxScore}`,
        );
      }
    }

    for (const rating of body.ratings) {
      const existingRows = await this.db
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(
              ratingRecord.indicatorSnapshotId,
              rating.indicatorSnapshotId,
            ),
            eq(ratingRecord.ratingType, 'self'),
          ),
        )
        .limit(1);

      const scoreStr: string = String(rating.score);

      if (existingRows.length > 0) {
        await this.db
          .update(ratingRecord)
          .set({
            score: scoreStr,
            comment: rating.comment || null,
            isDraft: body.isDraft,
            submittedAt: body.isDraft ? null : new Date(),
          })
          .where(eq(ratingRecord.id, existingRows[0].id));
      } else {
        await this.db.insert(ratingRecord).values({
          instanceId: id,
          indicatorSnapshotId: rating.indicatorSnapshotId,
          ratingType: 'self',
          score: scoreStr,
          comment: rating.comment || null,
          ratedBy: userId,
          isDraft: body.isDraft,
          submittedAt: body.isDraft ? null : new Date(),
        });
      }
    }

    if (!body.isDraft) {
      await this.db
        .update(assessmentInstance)
        .set({ status: 'supervisor_review' })
        .where(eq(assessmentInstance.id, id));
    }

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: body.isDraft
        ? 'save_self_draft'
        : 'submit_self_rating',
      targetType: 'assessment_instance',
      targetId: id,
    });

    this.logger.log(
      `Self rating ${body.isDraft ? 'draft saved' : 'submitted'} for instance ${id} by ${userId}`,
    );

    return { success: true };
  }

  async submitSupervisorRating(
    id: string,
    body: RatingSubmitRequest,
    userId: string,
  ): Promise<SupervisorRatingResponse> {
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // P0: 校验当前用户是否是该员工的上级
    const empRows = await this.db
      .select({ supervisorId: employee.supervisorId })
      .from(employee)
      .where(and(sql`(${employee.id}).user_id = ${instance.employeeId}`, isNull(employee.deletedAt)))
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }

    if (empRows[0].supervisorId !== userId) {
      throw new ForbiddenException('您不是该员工的上级，无法评分');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    const snapshotMap = new Map(
      allSnapshots.map((s) => [s.id, s]),
    );

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score > Number(snapshot.maxScore)) {
        throw new BadRequestException(
          `评分不能超过最高分 ${snapshot.maxScore}`,
        );
      }
    }

    for (const rating of body.ratings) {
      const existingRows = await this.db
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(
              ratingRecord.indicatorSnapshotId,
              rating.indicatorSnapshotId,
            ),
            eq(ratingRecord.ratingType, 'supervisor'),
          ),
        )
        .limit(1);

      const scoreStr: string = String(rating.score);

      if (existingRows.length > 0) {
        await this.db
          .update(ratingRecord)
          .set({
            score: scoreStr,
            comment: rating.comment || null,
            isDraft: body.isDraft,
            submittedAt: body.isDraft ? null : new Date(),
          })
          .where(eq(ratingRecord.id, existingRows[0].id));
      } else {
        await this.db.insert(ratingRecord).values({
          instanceId: id,
          indicatorSnapshotId: rating.indicatorSnapshotId,
          ratingType: 'supervisor',
          score: scoreStr,
          comment: rating.comment || null,
          ratedBy: userId,
          isDraft: body.isDraft,
          submittedAt: body.isDraft ? null : new Date(),
        });
      }
    }

    let totalScore: number = 0;
    let grade: string = 'D';

    if (!body.isDraft) {
      // ★ P0: 维度加权平均计算总分
      // 1. 按 dimensionName 分组
      const dimMap = new Map<string, typeof allSnapshots>();
      for (const snap of allSnapshots) {
        if (!dimMap.has(snap.dimensionName)) {
          dimMap.set(snap.dimensionName, []);
        }
        dimMap.get(snap.dimensionName)!.push(snap);
      }

      // 2. 建立评分查询映射
      const ratingBySnapId = new Map<string, number>();
      for (const r of body.ratings) {
        ratingBySnapId.set(r.indicatorSnapshotId, r.score);
      }

      // 3. 对每个维度计算加权分数
      let totalWeightedScore = 0;
      for (const [, snaps] of dimMap) {
        let dimScoreSum = 0;
        let dimMaxSum = 0;
        const dimWeight = snaps.length > 0 ? Number(snaps[0].dimensionWeight) : 0;

        for (const snap of snaps) {
          const score = ratingBySnapId.get(snap.id) ?? 0;
          dimScoreSum += score;
          dimMaxSum += Number(snap.maxScore);
        }

        // 维度加权分 = (维度实际得分 / 维度满分) × 维度权重 × 100
        if (dimMaxSum > 0 && dimWeight > 0) {
          totalWeightedScore += (dimScoreSum / dimMaxSum) * dimWeight * 100;
        } else if (dimMaxSum > 0) {
          // 权重为 0 时直接累加得分（兼容调整项等无权重指标）
          totalWeightedScore += dimScoreSum;
        }
      }

      totalScore = Math.round(totalWeightedScore * 100) / 100;

      grade = await this.performanceGradeService.matchGrade(totalScore);

      await this.db
        .update(assessmentInstance)
        .set({
          totalScore: String(totalScore),
          grade,
          status: 'pending_sign',
        })
        .where(eq(assessmentInstance.id, id));
    }

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: body.isDraft
        ? 'save_supervisor_draft'
        : 'submit_supervisor_rating',
      targetType: 'assessment_instance',
      targetId: id,
    });

    this.logger.log(
      `Supervisor rating ${body.isDraft ? 'draft saved' : `submitted, total=${totalScore}, grade=${grade}`} for instance ${id} by ${userId}`,
    );

    return { success: true, totalScore, grade };
  }

  async sign(
    id: string,
    body: SignRequest,
    userId: string,
    userName: string,
  ): Promise<{ success: boolean; status: string }> {
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    const effectiveSignName =
      body.signType === 'self'
        ? (body.signName?.trim() || userName || '')
        : (body.signName?.trim() || userName || '');
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }

    // P0: 签名身份校验
    if (body.signType === 'self') {
      if (instance.employeeId !== userId) {
        throw new ForbiddenException('只能签署自己的员工签名');
      }
    } else if (body.signType === 'supervisor') {
      const supRows = await this.db
        .select({ supervisorId: employee.supervisorId })
        .from(employee)
        .where(and(sql`(${employee.id}).user_id = ${instance.employeeId}`, isNull(employee.deletedAt)))
        .limit(1);

      if (supRows.length === 0 || supRows[0].supervisorId !== userId) {
        throw new ForbiddenException('您不是该员工的上级，无法签署上级签名');
      }
    }

    const now: Date = new Date();

    if (body.signType === 'self') {
      await this.db
        .update(assessmentInstance)
        .set({
          selfSignName: effectiveSignName,
          selfSignAt: now,
          selfSignImage: body.signImage || null,
        })
        .where(eq(assessmentInstance.id, id));
    } else {
      await this.db
        .update(assessmentInstance)
        .set({
          supervisorSignName: effectiveSignName,
          supervisorSignAt: now,
          supervisorSignImage: body.signImage || null,
        })
        .where(eq(assessmentInstance.id, id));
    }

    const updatedRows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);
    const updated = updatedRows[0];

    let newStatus: string = updated.status;

    if (updated.selfSignName && updated.supervisorSignName) {
      newStatus = 'completed';
      await this.db
        .update(assessmentInstance)
        .set({
          status: 'completed',
          completedAt: now,
        })
        .where(eq(assessmentInstance.id, id));
    }

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: `sign_${body.signType}`,
      targetType: 'assessment_instance',
      targetId: id,
    });

    this.logger.log(
      `Sign ${body.signType} for instance ${id} by ${userId}, status=${newStatus}`,
    );

    return { success: true, status: newStatus };
  }
}

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
  department,
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

  async detail(id: string, userId: string): Promise<AssessmentInstanceDetail> {
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // 权限校验：仅允许本人、当前上级或部门负责人查看考核详情
    const empRows = await this.db
      .select({
        name: employee.name,
        supervisorId: employee.supervisorId,
        empDepartment: employee.department,
      })
      .from(employee)
      .where(
        and(eq(employee.id, instance.employeeId), isNull(employee.deletedAt)),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }

    const isEmployee = instance.employeeId === userId;
    const isSupervisor = empRows[0].supervisorId === userId;
    let isDeptHead = false;
    if (!isEmployee && !isSupervisor) {
      const deptRows = await this.db
        .select({ id: department.id })
        .from(department)
        .where(
          and(
            eq(department.name, empRows[0].empDepartment),
            sql`(${department.headId}).user_id = ${userId}`,
          ),
        )
        .limit(1);
      isDeptHead = deptRows.length > 0;
    }

    if (!isEmployee && !isSupervisor && !isDeptHead) {
      throw new ForbiddenException('无权查看该考核记录');
    }

    const employeeName: string = empRows[0].name;

    let supervisorName: string = '';
    if (instance.supervisorId) {
      const supRows = await this.db
        .select({ name: employee.name })
        .from(employee)
        .where(
          and(
            eq(employee.id, instance.supervisorId),
            isNull(employee.deletedAt),
          ),
        )
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

    const indicators: AssessmentIndicatorDetail[] = snapshots.map((snap) => {
      const selfRating = ratingMap.get(`${snap.id}:self`);
      const supervisorRating = ratingMap.get(`${snap.id}:supervisor`);

      return {
        id: snap.id,
        dimensionName: snap.dimensionName,
        dimensionWeight: Number(snap.dimensionWeight),
        content: snap.content,
        description: snap.description || '',
        algorithm: snap.algorithm || '',
        dataSource: snap.dataSource || '',
        weight: Number(snap.weight),
        selfScore: selfRating?.score,
        selfComment: selfRating?.comment || undefined,
        supervisorScore: supervisorRating?.score,
        supervisorComment: supervisorRating?.comment || undefined,
      };
    });

    return {
      id: instance.id,
      period: instance.period,
      employeeId: instance.employeeId,
      employeeName,
      position: instance.position,
      supervisorId: instance.supervisorId || '',
      supervisorName,
      status: instance.status,
      totalScore: instance.totalScore ? Number(instance.totalScore) : undefined,
      grade: instance.grade || undefined,
      selfSignName: instance.selfSignName || undefined,
      selfSignAt: instance.selfSignAt
        ? instance.selfSignAt.toISOString()
        : undefined,
      selfSignImage: instance.selfSignImage || undefined,
      supervisorSignName: instance.supervisorSignName || undefined,
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

    // P0: 校验状态 — 仅 self_review 状态允许提交自评
    if (instance.status !== 'self_review') {
      throw new BadRequestException('当前状态不允许提交自评');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    const snapshotMap = new Map(allSnapshots.map((s) => [s.id, s]));

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score > Number(snapshot.weight)) {
        throw new BadRequestException(
          `评分不能超过指标权重分 ${snapshot.weight}`,
        );
      }
    }

    // P0: 非草稿提交时校验所有指标均已评分，防止漏评静默计 0 分
    if (!body.isDraft) {
      const submittedIds = new Set(
        body.ratings.map((r) => r.indicatorSnapshotId),
      );
      const missing = allSnapshots.filter((s) => !submittedIds.has(s.id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `以下指标未评分: ${missing.map((s) => s.content).join('、')}`,
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
            eq(ratingRecord.indicatorSnapshotId, rating.indicatorSnapshotId),
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
      action: body.isDraft ? 'save_self_draft' : 'submit_self_rating',
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

    // P0: 校验状态 — 仅 supervisor_review 状态允许提交上级评分
    if (instance.status !== 'supervisor_review') {
      throw new BadRequestException('当前状态不允许提交上级评分');
    }

    // P0: 校验当前用户是否是该员工的上级或部门负责人
    const empRows = await this.db
      .select({
        supervisorId: employee.supervisorId,
        empDepartment: employee.department,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.id}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }

    // P0: 身份校验 — 允许发布时上级（快照）、当前上级、或部门负责人评分
    const isPublishedSupervisor: boolean =
      !!instance.supervisorId && instance.supervisorId === userId;
    const isCurrentSupervisor: boolean = empRows[0].supervisorId === userId;
    let isDeptHead: boolean = false;
    if (!isPublishedSupervisor && !isCurrentSupervisor) {
      const deptRows = await this.db
        .select({ id: department.id })
        .from(department)
        .where(
          and(
            eq(department.name, empRows[0].empDepartment),
            sql`(${department.headId}).user_id = ${userId}`,
          ),
        )
        .limit(1);
      isDeptHead = deptRows.length > 0;
    }

    if (!isPublishedSupervisor && !isCurrentSupervisor && !isDeptHead) {
      throw new ForbiddenException('您不是该员工的上级或部门负责人，无法评分');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    const snapshotMap = new Map(allSnapshots.map((s) => [s.id, s]));

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score > Number(snapshot.weight)) {
        throw new BadRequestException(
          `评分不能超过指标权重分 ${snapshot.weight}`,
        );
      }
    }

    // P0: 非草稿提交时校验所有指标均已评分，防止漏评静默计 0 分
    if (!body.isDraft) {
      const submittedIds = new Set(
        body.ratings.map((r) => r.indicatorSnapshotId),
      );
      const missing = allSnapshots.filter((s) => !submittedIds.has(s.id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `以下指标未评分: ${missing.map((s) => s.content).join('、')}`,
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
            eq(ratingRecord.indicatorSnapshotId, rating.indicatorSnapshotId),
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
      const ratingBySnapId = new Map<string, number>();
      for (const r of body.ratings) {
        ratingBySnapId.set(r.indicatorSnapshotId, r.score);
      }

      for (const snap of allSnapshots) {
        totalScore += ratingBySnapId.get(snap.id) ?? 0;
      }

      totalScore = Math.round(totalScore * 100) / 100;

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

    // P0: 校验考核状态 — 只有 pending_sign 状态允许签名
    if (instance.status !== 'pending_sign') {
      throw new BadRequestException('当前状态不允许签名，请先完成评分');
    }

    const effectiveSignName =
      body.signType === 'self'
        ? body.signName?.trim() || userName || ''
        : body.signName?.trim() || userName || '';
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }

    // P0: 签名不可变性校验 — 已签不可覆盖
    if (body.signType === 'self' && instance.selfSignName) {
      throw new BadRequestException('本人已签名，不可重复签名');
    }
    if (body.signType === 'supervisor' && instance.supervisorSignName) {
      throw new BadRequestException('上级已签名，不可重复签名');
    }

    // P0: 签名身份校验
    if (body.signType === 'self') {
      if (instance.employeeId !== userId) {
        throw new ForbiddenException('只能签署自己的员工签名');
      }
    } else if (body.signType === 'supervisor') {
      const supRows = await this.db
        .select({
          supervisorId: employee.supervisorId,
          empDepartment: employee.department,
        })
        .from(employee)
        .where(
          and(
            sql`(${employee.id}).user_id = ${instance.employeeId}`,
            isNull(employee.deletedAt),
          ),
        )
        .limit(1);

      if (supRows.length === 0) {
        throw new ForbiddenException('员工信息不存在，无法签署上级签名');
      }

      // P0: 上级签名身份校验 — 允许发布时上级（快照）、当前上级、或部门负责人
      const isPublishedSup: boolean =
        !!instance.supervisorId && instance.supervisorId === userId;
      const isCurrentSup: boolean = supRows[0].supervisorId === userId;
      let isHead: boolean = false;
      if (!isPublishedSup && !isCurrentSup) {
        const deptRows = await this.db
          .select({ id: department.id })
          .from(department)
          .where(
            and(
              eq(department.name, supRows[0].empDepartment),
              sql`(${department.headId}).user_id = ${userId}`,
            ),
          )
          .limit(1);
        isHead = deptRows.length > 0;
      }

      if (!isPublishedSup && !isCurrentSup && !isHead) {
        throw new ForbiddenException(
          '您不是该员工的上级或部门负责人，无法签署上级签名',
        );
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

    // 原子操作：双方都已签名时将状态推进到 completed
    await this.db
      .update(assessmentInstance)
      .set({
        status: 'completed',
        completedAt: now,
      })
      .where(
        and(
          eq(assessmentInstance.id, id),
          sql`${assessmentInstance.selfSignName} IS NOT NULL`,
          sql`${assessmentInstance.supervisorSignName} IS NOT NULL`,
        ),
      );

    // 读取最终状态
    const updatedRows = await this.db
      .select({ status: assessmentInstance.status })
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);
    const newStatus: string = updatedRows[0]?.status ?? 'pending_sign';

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

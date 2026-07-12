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
import { eq, and, sql, isNull, inArray } from 'drizzle-orm';
import {
  assessmentInstance,
  assessmentIndicatorSnapshot,
  ratingRecord,
  auditLog,
  employee,
  performanceGrade,
} from '@server/database/schema';
import { PerformanceGradeService } from '../performance-grade/performance-grade.service';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import type {
  AssessmentInstanceDetail,
  AssessmentIndicatorDetail,
  RatingSubmitRequest,
  RatingSubmitWithSignRequest,
  SignRequest,
  SupervisorRatingResponse,
} from '@shared/api.interface';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'id'): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException(`${label} 格式无效`);
  }
}

/** 总分保留小数位数 */
const SCORE_PRECISION = 100;
type SignType = 'self' | 'supervisor';

export function getStatusAfterSelfRatingSubmit(): string {
  return 'pending_sign';
}

export function getStatusAfterSupervisorRatingSubmit(): string {
  return 'supervisor_sign';
}

export function getStatusAfterSelfRatingWithSignSubmit(): string {
  return 'supervisor_review';
}

export function getStatusAfterSupervisorRatingWithSignSubmit(): string {
  return 'completed';
}

export function isSignAllowedInStatus(
  status: string,
  signType: SignType,
): boolean {
  return (
    (status === 'pending_sign' && signType === 'self') ||
    (status === 'supervisor_sign' && signType === 'supervisor')
  );
}

export function getStatusAfterSign(
  status: string,
  signType: SignType,
): string {
  if (status === 'pending_sign' && signType === 'self') {
    return 'supervisor_review';
  }
  if (status === 'supervisor_sign' && signType === 'supervisor') {
    return 'completed';
  }
  return status;
}

export type RatingValidationInput = {
  indicatorSnapshotId: string;
  score?: number | null;
  completionStatus?: string;
};

export type SnapshotValidationInput = {
  id: string;
  weight: string | number;
  content: string;
};

export function validateRatingsAgainstSnapshots(
  ratings: RatingValidationInput[] | undefined,
  snapshots: SnapshotValidationInput[],
  isDraft: boolean,
  options: { requireCompletionStatus?: boolean } = {},
): void {
  const snapshotMap = new Map(snapshots.map((s) => [s.id, s]));

  if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
    throw new BadRequestException('评分数据不能为空');
  }

  for (const rating of ratings) {
    const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
    if (!snapshot) {
      throw new BadRequestException(
        `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
      );
    }
    if (rating.score == null) {
      continue;
    }
    if (rating.score < 0 || !Number.isFinite(rating.score)) {
      throw new BadRequestException('评分不能为负数或非法数值');
    }
  }

  if (!isDraft) {
    const submittedIds = new Set(
      ratings
        .filter((r) => r.score != null)
        .map((r) => r.indicatorSnapshotId),
    );
    const missing = snapshots.filter((s) => !submittedIds.has(s.id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `以下指标未评分: ${missing.map((s) => s.content).join('、')}`,
      );
    }

    if (options.requireCompletionStatus) {
      const missingCompletion = snapshots.filter((s) => {
        const rating = ratings.find((r) => r.indicatorSnapshotId === s.id);
        return !rating?.completionStatus?.trim();
      });
      if (missingCompletion.length > 0) {
        throw new BadRequestException(
          `以下指标未填写完成情况: ${missingCompletion.map((s) => s.content).join('、')}`,
        );
      }
    }
  }
}

@Injectable()
export class AssessmentOperationService {
  private readonly logger = new Logger(AssessmentOperationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly performanceGradeService: PerformanceGradeService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  /** 统一的权限校验：检查当前用户是否为员工本人、上级、部门负责人或系统管理员 */
  private async checkAssessmentAccess(
    instanceEmployeeId: string,
    instanceSupervisorId: string | null,
    empSupervisorId: string | null,
    _empDepartment: string,
    userId: string,
  ): Promise<{
    isEmployee: boolean;
    isSupervisor: boolean;
    isDeptHead: boolean;
    isAdmin: boolean;
  }> {
    const isEmployee = instanceEmployeeId === userId;
    const isSupervisor =
      (!!instanceSupervisorId && instanceSupervisorId === userId) ||
      empSupervisorId === userId;
    const scope = await this.accessScopeService.getScope(userId);
    const isAdmin = scope.kind === 'global';
    const hasScopedAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      instanceEmployeeId,
      { includeSelf: true },
    );
    const isDeptHead = !isEmployee && !isSupervisor && !isAdmin && hasScopedAccess;

    return { isEmployee, isSupervisor, isDeptHead, isAdmin };
  }

  async detail(id: string, userId: string): Promise<AssessmentInstanceDetail> {
    validateUUID(id);
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
        and(eq(employee.employeeId, instance.employeeId), isNull(employee.deletedAt)),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }

    const access = await this.checkAssessmentAccess(
      instance.employeeId,
      instance.supervisorId,
      empRows[0].supervisorId,
      empRows[0].empDepartment,
      userId,
    );

    if (
      !access.isEmployee &&
      !access.isSupervisor &&
      !access.isDeptHead &&
      !access.isAdmin
    ) {
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
            eq(employee.employeeId, instance.supervisorId),
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
      {
        score?: number;
        comment?: string | null;
        completionStatus?: string | null;
      }
    >();
    for (const r of allRatings) {
      const key = `${r.indicatorSnapshotId}:${r.ratingType}`;
      ratingMap.set(key, {
        score: r.score == null ? undefined : Number(r.score),
        comment: r.comment,
        completionStatus: r.completionStatus,
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
        selfCompletionStatus: selfRating?.completionStatus || undefined,
        selfComment: selfRating?.comment || undefined,
        supervisorScore: supervisorRating?.score,
        supervisorComment: supervisorRating?.comment || undefined,
      };
    });

    // 根据等级查找绩效系数
    let coefficient: string | undefined;
    if (instance.grade) {
      try {
        const gradeRows = await this.db
          .select({ coefficient: performanceGrade.coefficient })
          .from(performanceGrade)
          .where(
            and(
              eq(performanceGrade.name, instance.grade),
              eq(performanceGrade.isActive, true),
            ),
          )
          .limit(1);
        coefficient = gradeRows[0]?.coefficient ?? undefined;
      } catch {
        coefficient = undefined;
      }
    }

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
      coefficient,
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
    validateUUID(id);

    // ---- 前置校验（事务外，快速失败） ----
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // 校验员工状态 — 离职员工不可评分
    const empStatus = await this.db
      .select({ status: employee.status })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    if (empStatus.length === 0) {
      throw new BadRequestException('未找到员工信息，无法提交评分');
    }
    if (!empStatus[0].status) {
      throw new BadRequestException('员工已离职，无法提交评分');
    }

    // 校验当前用户是否为该员工本人
    if (instance.employeeId !== userId) {
      throw new ForbiddenException('只能提交自己的自评');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    validateRatingsAgainstSnapshots(body.ratings, allSnapshots, body.isDraft, {
      requireCompletionStatus: true,
    });

    // ---- 事务：锁行 → 批量 upsert → 状态推进 → 审计日志 ----
    await this.db.transaction(async (tx) => {
      // SELECT FOR UPDATE — 锁定实例行，防止并发修改
      const locked = await tx
        .select({ status: assessmentInstance.status })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, id))
        .for('update')
        .limit(1);

      if (locked.length === 0) {
        throw new NotFoundException('考核记录不存在');
      }
      // 事务内二次校验状态（防止前置校验与事务间的 TOCTOU）
      if (locked[0].status !== 'self_review') {
        throw new BadRequestException('当前状态不允许提交自评');
      }

      // 批量查询已有评分记录（消除 N+1）
      const snapshotIds = body.ratings.map((r) => r.indicatorSnapshotId);
      const existingList = await tx
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(ratingRecord.ratingType, 'self'),
            inArray(ratingRecord.indicatorSnapshotId, snapshotIds),
          ),
        );

      const existingMap = new Map(
        existingList.map((r) => [r.indicatorSnapshotId, r]),
      );

      for (const rating of body.ratings) {
        const existingRow = existingMap.get(rating.indicatorSnapshotId);
        const scoreStr: string | null =
          rating.score == null ? null : String(rating.score);

        if (existingRow) {
          await tx
            .update(ratingRecord)
            .set({
              score: scoreStr,
              completionStatus: rating.completionStatus ?? null,
              comment: rating.comment || null,
              isDraft: body.isDraft,
              submittedAt: body.isDraft ? null : new Date(),
            })
            .where(eq(ratingRecord.id, existingRow.id));
        } else {
          await tx.insert(ratingRecord).values({
            instanceId: id,
            indicatorSnapshotId: rating.indicatorSnapshotId,
            ratingType: 'self',
            score: scoreStr,
            completionStatus: rating.completionStatus ?? null,
            comment: rating.comment || null,
            ratedBy: userId,
            isDraft: body.isDraft,
            submittedAt: body.isDraft ? null : new Date(),
          });
        }
      }

      if (!body.isDraft) {
        await tx
          .update(assessmentInstance)
          .set({ status: getStatusAfterSelfRatingSubmit() })
          .where(eq(assessmentInstance.id, id));
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: body.isDraft ? 'save_self_draft' : 'submit_self_rating',
        targetType: 'assessment_instance',
        targetId: id,
      });
    });

    this.logger.log(
      `Self rating ${body.isDraft ? 'draft saved' : 'submitted'} for instance ${id} by ${userId}`,
    );

    return { success: true };
  }

  async submitSelfRatingWithSign(
    id: string,
    body: RatingSubmitWithSignRequest,
    userId: string,
    userName: string,
  ): Promise<{ success: boolean; status: string }> {
    validateUUID(id);

    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];
    if (instance.employeeId !== userId) {
      throw new ForbiddenException('只能提交自己的自评');
    }
    if (instance.status !== 'self_review') {
      throw new BadRequestException('当前状态不允许提交自评');
    }
    if (instance.selfSignName) {
      throw new BadRequestException('本人已签名，不可重复提交');
    }

    const effectiveSignName = body.signName?.trim() || userName || '';
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }
    if (effectiveSignName.length > 255) {
      throw new BadRequestException('签名姓名不能超过255个字符');
    }

    const empStatus = await this.db
      .select({ status: employee.status })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    if (empStatus.length === 0) {
      throw new BadRequestException('未找到员工信息，无法提交评分');
    }
    if (!empStatus[0].status) {
      throw new BadRequestException('员工已离职，无法提交评分');
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    validateRatingsAgainstSnapshots(body.ratings, allSnapshots, false, {
      requireCompletionStatus: true,
    });

    const now = new Date();
    const newStatus = getStatusAfterSelfRatingWithSignSubmit();

    await this.db.transaction(async (tx) => {
      const locked = await tx
        .select({
          status: assessmentInstance.status,
          employeeId: assessmentInstance.employeeId,
          selfSignName: assessmentInstance.selfSignName,
        })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, id))
        .for('update')
        .limit(1);

      if (locked.length === 0) {
        throw new NotFoundException('考核记录不存在');
      }
      if (locked[0].status !== 'self_review') {
        throw new BadRequestException('当前状态不允许提交自评');
      }
      if (locked[0].employeeId !== userId) {
        throw new ForbiddenException('只能提交自己的自评');
      }
      if (locked[0].selfSignName) {
        throw new BadRequestException('本人已签名，不可重复提交');
      }

      const snapshotIds = body.ratings.map((r) => r.indicatorSnapshotId);
      const existingList = await tx
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(ratingRecord.ratingType, 'self'),
            inArray(ratingRecord.indicatorSnapshotId, snapshotIds),
          ),
        );
      const existingMap = new Map(
        existingList.map((r) => [r.indicatorSnapshotId, r]),
      );

      for (const rating of body.ratings) {
        const existingRow = existingMap.get(rating.indicatorSnapshotId);
        const scoreStr = rating.score == null ? null : String(rating.score);
        if (existingRow) {
          await tx
            .update(ratingRecord)
            .set({
              score: scoreStr,
              completionStatus: rating.completionStatus ?? null,
              comment: rating.comment || null,
              isDraft: false,
              submittedAt: now,
            })
            .where(eq(ratingRecord.id, existingRow.id));
        } else {
          await tx.insert(ratingRecord).values({
            instanceId: id,
            indicatorSnapshotId: rating.indicatorSnapshotId,
            ratingType: 'self',
            score: scoreStr,
            completionStatus: rating.completionStatus ?? null,
            comment: rating.comment || null,
            ratedBy: userId,
            isDraft: false,
            submittedAt: now,
          });
        }
      }

      const updateResult = await tx
        .update(assessmentInstance)
        .set({
          selfSignName: effectiveSignName,
          selfSignAt: now,
          selfSignImage: body.signImage || null,
          status: newStatus,
        })
        .where(
          and(
            eq(assessmentInstance.id, id),
            sql`${assessmentInstance.selfSignName} IS NULL`,
          ),
        )
        .returning();
      if (updateResult.length === 0) {
        throw new BadRequestException('本人签名已被他人抢先提交');
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'submit_self_rating_with_sign',
        targetType: 'assessment_instance',
        targetId: id,
      });
    });

    this.logger.log(
      `Self rating submitted with sign for instance ${id} by ${userId}`,
    );

    return { success: true, status: newStatus };
  }

  async submitSupervisorRating(
    id: string,
    body: RatingSubmitRequest,
    userId: string,
  ): Promise<SupervisorRatingResponse> {
    validateUUID(id);

    // ---- 前置校验（事务外，快速失败） ----
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // 校验员工信息与状态
    const empRows = await this.db
      .select({
        supervisorId: employee.supervisorId,
        empDepartment: employee.department,
        status: employee.status,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }
    if (!empRows[0].status) {
      throw new BadRequestException('员工已离职或不可用，无法提交评分');
    }

    // 身份校验：上级评分允许发布时上级（快照）、当前上级、部门负责人或系统管理员
    const access = await this.checkAssessmentAccess(
      instance.employeeId,
      instance.supervisorId,
      empRows[0].supervisorId,
      empRows[0].empDepartment,
      userId,
    );

    if (!access.isSupervisor && !access.isDeptHead && !access.isAdmin) {
      throw new ForbiddenException(
        '您不是该员工的上级、部门负责人或系统管理员，无法评分',
      );
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    validateRatingsAgainstSnapshots(body.ratings, allSnapshots, body.isDraft);

    // ---- 事务：锁行 → 批量 upsert → 总分/等级/状态 → 审计日志 ----
    let resultTotalScore = 0;
    let resultGrade = 'D';

    await this.db.transaction(async (tx) => {
      // SELECT FOR UPDATE — 锁定实例行
      const locked = await tx
        .select({ status: assessmentInstance.status })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, id))
        .for('update')
        .limit(1);

      if (locked.length === 0) {
        throw new NotFoundException('考核记录不存在');
      }
      if (locked[0].status !== 'supervisor_review') {
        throw new BadRequestException('当前状态不允许提交上级评分');
      }

      // 批量查询已有评分记录
      const snapshotIds = body.ratings.map((r) => r.indicatorSnapshotId);
      const existingList = await tx
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(ratingRecord.ratingType, 'supervisor'),
            inArray(ratingRecord.indicatorSnapshotId, snapshotIds),
          ),
        );

      const existingMap = new Map(
        existingList.map((r) => [r.indicatorSnapshotId, r]),
      );

      for (const rating of body.ratings) {
        const existingRow = existingMap.get(rating.indicatorSnapshotId);
        const scoreStr: string | null =
          rating.score == null ? null : String(rating.score);

        if (existingRow) {
          await tx
            .update(ratingRecord)
            .set({
              score: scoreStr,
              comment: rating.comment || null,
              isDraft: body.isDraft,
              submittedAt: body.isDraft ? null : new Date(),
            })
            .where(eq(ratingRecord.id, existingRow.id));
        } else {
          await tx.insert(ratingRecord).values({
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

      if (!body.isDraft) {
        // 在事务内计算总分和等级
        const ratingBySnapId = new Map<string, number>();
        for (const r of body.ratings) {
          if (r.score != null) {
            ratingBySnapId.set(r.indicatorSnapshotId, r.score);
          }
        }

        let totalScore = 0;
        for (const snap of allSnapshots) {
          totalScore += ratingBySnapId.get(snap.id) ?? 0;
        }

        totalScore = Math.round(totalScore * SCORE_PRECISION) / SCORE_PRECISION;

        const grade = await this.performanceGradeService.matchGrade(
          totalScore,
          tx,
        );

        await tx
          .update(assessmentInstance)
          .set({
            totalScore: String(totalScore),
            grade,
            status: getStatusAfterSupervisorRatingSubmit(),
          })
          .where(eq(assessmentInstance.id, id));

        resultTotalScore = totalScore;
        resultGrade = grade;
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: body.isDraft
          ? 'save_supervisor_draft'
          : 'submit_supervisor_rating',
        targetType: 'assessment_instance',
        targetId: id,
      });
    });

    this.logger.log(
      `Supervisor rating ${body.isDraft ? 'draft saved' : `submitted, total=${resultTotalScore}, grade=${resultGrade}`} for instance ${id} by ${userId}`,
    );

    return { success: true, totalScore: resultTotalScore, grade: resultGrade };
  }

  async submitSupervisorRatingWithSign(
    id: string,
    body: RatingSubmitWithSignRequest,
    userId: string,
    userName: string,
  ): Promise<SupervisorRatingResponse & { status: string }> {
    validateUUID(id);

    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];
    if (instance.status !== 'supervisor_review') {
      throw new BadRequestException('当前状态不允许提交上级评分');
    }
    if (!instance.selfSignName) {
      throw new BadRequestException('请先完成员工评分签名');
    }
    if (instance.supervisorSignName) {
      throw new BadRequestException('上级已签名，不可重复提交');
    }

    const effectiveSignName = body.signName?.trim() || userName || '';
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }
    if (effectiveSignName.length > 255) {
      throw new BadRequestException('签名姓名不能超过255个字符');
    }

    const empRows = await this.db
      .select({
        supervisorId: employee.supervisorId,
        empDepartment: employee.department,
        status: employee.status,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }
    if (!empRows[0].status) {
      throw new BadRequestException('员工已离职或不可用，无法提交评分');
    }

    const access = await this.checkAssessmentAccess(
      instance.employeeId,
      instance.supervisorId,
      empRows[0].supervisorId,
      empRows[0].empDepartment,
      userId,
    );

    if (!access.isSupervisor && !access.isDeptHead && !access.isAdmin) {
      throw new ForbiddenException(
        '您不是该员工的上级、部门负责人或系统管理员，无法评分',
      );
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    validateRatingsAgainstSnapshots(body.ratings, allSnapshots, false);

    const now = new Date();
    const newStatus = getStatusAfterSupervisorRatingWithSignSubmit();
    let resultTotalScore = 0;
    let resultGrade = 'D';

    await this.db.transaction(async (tx) => {
      const locked = await tx
        .select({
          status: assessmentInstance.status,
          selfSignName: assessmentInstance.selfSignName,
          supervisorSignName: assessmentInstance.supervisorSignName,
        })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, id))
        .for('update')
        .limit(1);

      if (locked.length === 0) {
        throw new NotFoundException('考核记录不存在');
      }
      if (locked[0].status !== 'supervisor_review') {
        throw new BadRequestException('当前状态不允许提交上级评分');
      }
      if (!locked[0].selfSignName) {
        throw new BadRequestException('请先完成员工评分签名');
      }
      if (locked[0].supervisorSignName) {
        throw new BadRequestException('上级已签名，不可重复提交');
      }

      const snapshotIds = body.ratings.map((r) => r.indicatorSnapshotId);
      const existingList = await tx
        .select()
        .from(ratingRecord)
        .where(
          and(
            eq(ratingRecord.instanceId, id),
            eq(ratingRecord.ratingType, 'supervisor'),
            inArray(ratingRecord.indicatorSnapshotId, snapshotIds),
          ),
        );
      const existingMap = new Map(
        existingList.map((r) => [r.indicatorSnapshotId, r]),
      );

      for (const rating of body.ratings) {
        const existingRow = existingMap.get(rating.indicatorSnapshotId);
        const scoreStr = rating.score == null ? null : String(rating.score);
        if (existingRow) {
          await tx
            .update(ratingRecord)
            .set({
              score: scoreStr,
              comment: rating.comment || null,
              isDraft: false,
              submittedAt: now,
            })
            .where(eq(ratingRecord.id, existingRow.id));
        } else {
          await tx.insert(ratingRecord).values({
            instanceId: id,
            indicatorSnapshotId: rating.indicatorSnapshotId,
            ratingType: 'supervisor',
            score: scoreStr,
            comment: rating.comment || null,
            ratedBy: userId,
            isDraft: false,
            submittedAt: now,
          });
        }
      }

      const ratingBySnapId = new Map<string, number>();
      for (const r of body.ratings) {
        if (r.score != null) {
          ratingBySnapId.set(r.indicatorSnapshotId, r.score);
        }
      }

      let totalScore = 0;
      for (const snap of allSnapshots) {
        totalScore += ratingBySnapId.get(snap.id) ?? 0;
      }
      totalScore = Math.round(totalScore * SCORE_PRECISION) / SCORE_PRECISION;

      const grade = await this.performanceGradeService.matchGrade(
        totalScore,
        tx,
      );

      const updateResult = await tx
        .update(assessmentInstance)
        .set({
          totalScore: String(totalScore),
          grade,
          supervisorSignName: effectiveSignName,
          supervisorSignAt: now,
          supervisorSignImage: body.signImage || null,
          status: newStatus,
          completedAt: now,
        })
        .where(
          and(
            eq(assessmentInstance.id, id),
            sql`${assessmentInstance.supervisorSignName} IS NULL`,
          ),
        )
        .returning();
      if (updateResult.length === 0) {
        throw new BadRequestException('上级签名已被他人抢先提交');
      }

      resultTotalScore = totalScore;
      resultGrade = grade;

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'submit_supervisor_rating_with_sign',
        targetType: 'assessment_instance',
        targetId: id,
      });
    });

    this.logger.log(
      `Supervisor rating submitted with sign for instance ${id} by ${userId}, total=${resultTotalScore}, grade=${resultGrade}`,
    );

    return {
      success: true,
      totalScore: resultTotalScore,
      grade: resultGrade,
      status: newStatus,
    };
  }

  async sign(
    id: string,
    body: SignRequest,
    userId: string,
    userName: string,
  ): Promise<{ success: boolean; status: string }> {
    validateUUID(id);
    const rows = await this.db
      .select()
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('考核记录不存在');
    }

    const instance = rows[0];

    // P1: 校验 signType 值
    if (body.signType !== 'self' && body.signType !== 'supervisor') {
      throw new BadRequestException('签名类型无效，必须为 self 或 supervisor');
    }

    if (!isSignAllowedInStatus(instance.status, body.signType)) {
      throw new BadRequestException(
        body.signType === 'self'
          ? '当前状态不允许员工签名，请先完成自评'
          : '当前状态不允许上级签名，请先完成上级评分',
      );
    }

    const effectiveSignName =
      body.signType === 'self'
        ? body.signName?.trim() || userName || ''
        : body.signName?.trim() || userName || '';
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }
    if (effectiveSignName.length > 255) {
      throw new BadRequestException('签名姓名不能超过255个字符');
    }

    // P0: 签名不可变性校验 — 已签不可覆盖
    if (body.signType === 'self' && instance.selfSignName) {
      throw new BadRequestException('本人已签名，不可重复签名');
    }
    if (body.signType === 'supervisor' && instance.supervisorSignName) {
      throw new BadRequestException('上级已签名，不可重复签名');
    }

    // P0: 签名身份校验
    let access: Awaited<ReturnType<typeof this.checkAssessmentAccess>> | null =
      null;
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
            sql`(${employee.employeeId}).user_id = ${instance.employeeId}`,
            isNull(employee.deletedAt),
          ),
        )
        .limit(1);

      if (supRows.length === 0) {
        throw new ForbiddenException('员工信息不存在，无法签署上级签名');
      }

      // P0: 上级签名身份校验 — 允许发布时上级（快照）、当前上级、部门负责人或系统管理员
      access = await this.checkAssessmentAccess(
        instance.employeeId,
        instance.supervisorId,
        supRows[0].supervisorId,
        supRows[0].empDepartment,
        userId,
      );

      if (!access.isSupervisor && !access.isDeptHead && !access.isAdmin) {
        throw new ForbiddenException(
          '您不是该员工的上级、部门负责人或系统管理员，无法签署上级签名',
        );
      }
    }

    const now: Date = new Date();
    let newStatus = getStatusAfterSign(instance.status, body.signType);

    // 事务保护：签名 CAS 更新 + 状态推进 + 审计日志原子化
    await this.db.transaction(async (tx) => {
      // SELECT FOR UPDATE — 锁定实例行
      const locked = await tx
        .select({
          status: assessmentInstance.status,
          selfSignName: assessmentInstance.selfSignName,
          supervisorSignName: assessmentInstance.supervisorSignName,
          employeeId: assessmentInstance.employeeId,
          supervisorId: assessmentInstance.supervisorId,
        })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, id))
        .for('update')
        .limit(1);

      if (locked.length === 0) {
        throw new NotFoundException('考核记录不存在');
      }

      const current = locked[0];

      if (!isSignAllowedInStatus(current.status, body.signType)) {
        throw new BadRequestException(
          body.signType === 'self'
            ? '当前状态不允许员工签名，请先完成自评'
            : '当前状态不允许上级签名，请先完成上级评分',
        );
      }

      newStatus = getStatusAfterSign(current.status, body.signType);

      // CAS 写入签名
      if (body.signType === 'self') {
        // 事务内二次校验不可变性
        if (current.selfSignName) {
          throw new BadRequestException('本人已签名，不可重复签名');
        }
        if (current.employeeId !== userId) {
          throw new ForbiddenException('只能签署自己的员工签名');
        }

        const selfResult = await tx
          .update(assessmentInstance)
          .set({
            selfSignName: effectiveSignName,
            selfSignAt: now,
            selfSignImage: body.signImage || null,
            status: newStatus,
          })
          .where(
            and(
              eq(assessmentInstance.id, id),
              sql`${assessmentInstance.selfSignName} IS NULL`,
            ),
          )
          .returning();
        if (selfResult.length === 0) {
          throw new BadRequestException('本人签名已被他人抢先提交');
        }
      } else {
        // supervisor sign
        if (current.supervisorSignName) {
          throw new BadRequestException('上级已签名，不可重复签名');
        }
        if (!current.selfSignName) {
          throw new BadRequestException('请先完成员工签名');
        }

        if (
          access &&
          !access.isSupervisor &&
          !access.isDeptHead &&
          !access.isAdmin
        ) {
          throw new ForbiddenException(
            '您不是该员工的上级、部门负责人或系统管理员，无法签署上级签名',
          );
        }

        const supResult = await tx
          .update(assessmentInstance)
          .set({
            supervisorSignName: effectiveSignName,
            supervisorSignAt: now,
            supervisorSignImage: body.signImage || null,
            status: newStatus,
            completedAt: now,
          })
          .where(
            and(
              eq(assessmentInstance.id, id),
              sql`${assessmentInstance.supervisorSignName} IS NULL`,
            ),
          )
          .returning();
        if (supResult.length === 0) {
          throw new BadRequestException('上级签名已被他人抢先提交');
        }
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: `sign_${body.signType}`,
        targetType: 'assessment_instance',
        targetId: id,
      });
    });

    this.logger.log(
      `Sign ${body.signType} for instance ${id} by ${userId}, status=${newStatus}`,
    );

    return { success: true, status: newStatus };
  }
}

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'id'): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException(`${label} 格式无效`);
  }
}

/** 总分保留小数位数 */
const SCORE_PRECISION = 100;

@Injectable()
export class AssessmentOperationService {
  private readonly logger = new Logger(AssessmentOperationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly performanceGradeService: PerformanceGradeService,
  ) {}

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

    // 也允许系统管理员查看
    let isAdmin = false;
    if (!isEmployee && !isSupervisor && !isDeptHead) {
      const adminRows = await this.db
        .select({ id: employee.id })
        .from(employee)
        .where(
          and(
            sql`(${employee.id}).user_id = ${userId}`,
            eq(employee.role, 'admin'),
            isNull(employee.deletedAt),
          ),
        )
        .limit(1);
      isAdmin = adminRows.length > 0;
    }

    if (!isEmployee && !isSupervisor && !isDeptHead && !isAdmin) {
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
          sql`(${employee.id}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);
    if (empStatus.length === 0) {
      throw new BadRequestException('未找到员工信息，无法提交评分');
    }
    if (empStatus[0].status !== 'active') {
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

    const snapshotMap = new Map(allSnapshots.map((s) => [s.id, s]));

    // 运行时校验 body.ratings 不为空
    if (
      !body.ratings ||
      !Array.isArray(body.ratings) ||
      body.ratings.length === 0
    ) {
      throw new BadRequestException('评分数据不能为空');
    }

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score < 0 || !Number.isFinite(rating.score)) {
        throw new BadRequestException('评分不能为负数或非法数值');
      }
      if (rating.score > Number(snapshot.weight)) {
        throw new BadRequestException(
          `评分不能超过指标权重分 ${snapshot.weight}`,
        );
      }
    }

    // 非草稿提交时校验所有指标均已评分，防止漏评静默计 0 分
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
        const scoreStr: string = String(rating.score);

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
        await tx
          .update(assessmentInstance)
          .set({ status: 'supervisor_review' })
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
          sql`(${employee.id}).user_id = ${instance.employeeId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (empRows.length === 0) {
      throw new NotFoundException('员工信息不存在');
    }
    if (empRows[0].status !== 'active') {
      throw new BadRequestException('员工已离职或不可用，无法提交评分');
    }

    // 身份校验
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

    let isAdmin = false;
    if (!isPublishedSupervisor && !isCurrentSupervisor && !isDeptHead) {
      const adminCheck = await this.db
        .select({ id: employee.id })
        .from(employee)
        .where(
          and(
            sql`(${employee.id}).user_id = ${userId}`,
            eq(employee.role, 'admin'),
            isNull(employee.deletedAt),
          ),
        )
        .limit(1);
      isAdmin = adminCheck.length > 0;
    }

    if (
      !isPublishedSupervisor &&
      !isCurrentSupervisor &&
      !isDeptHead &&
      !isAdmin
    ) {
      throw new ForbiddenException(
        '您不是该员工的上级、部门负责人或系统管理员，无法评分',
      );
    }

    const allSnapshots = await this.db
      .select()
      .from(assessmentIndicatorSnapshot)
      .where(eq(assessmentIndicatorSnapshot.instanceId, id));

    const snapshotMap = new Map(allSnapshots.map((s) => [s.id, s]));

    // 运行时校验 body.ratings 不为空
    if (
      !body.ratings ||
      !Array.isArray(body.ratings) ||
      body.ratings.length === 0
    ) {
      throw new BadRequestException('评分数据不能为空');
    }

    for (const rating of body.ratings) {
      const snapshot = snapshotMap.get(rating.indicatorSnapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `指标快照不属于该考核实例: ${rating.indicatorSnapshotId}`,
        );
      }
      if (rating.score < 0 || !Number.isFinite(rating.score)) {
        throw new BadRequestException('评分不能为负数或非法数值');
      }
      if (rating.score > Number(snapshot.weight)) {
        throw new BadRequestException(
          `评分不能超过指标权重分 ${snapshot.weight}`,
        );
      }
    }

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
        const scoreStr: string = String(rating.score);

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
          ratingBySnapId.set(r.indicatorSnapshotId, r.score);
        }

        let totalScore = 0;
        for (const snap of allSnapshots) {
          totalScore += ratingBySnapId.get(snap.id) ?? 0;
        }

        totalScore = Math.round(totalScore * SCORE_PRECISION) / SCORE_PRECISION;

        const grade = await this.performanceGradeService.matchGrade(totalScore);

        await tx
          .update(assessmentInstance)
          .set({
            totalScore: String(totalScore),
            grade,
            status: 'pending_sign',
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

    // P0: 校验考核状态 — 只有 pending_sign 状态允许签名
    if (instance.status !== 'pending_sign') {
      throw new BadRequestException('当前状态不允许签名，请先完成评分');
    }

    // P1: 校验 signType 值
    if (body.signType !== 'self' && body.signType !== 'supervisor') {
      throw new BadRequestException('签名类型无效，必须为 self 或 supervisor');
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

      // P0: admin 兜底 — 无主管员工由系统管理员签署
      let isAdminSign = false;
      if (!isPublishedSup && !isCurrentSup && !isHead) {
        const adminCheck = await this.db
          .select({ id: employee.id })
          .from(employee)
          .where(
            and(
              sql`(${employee.id}).user_id = ${userId}`,
              eq(employee.role, 'admin'),
              isNull(employee.deletedAt),
            ),
          )
          .limit(1);
        isAdminSign = adminCheck.length > 0;
      }

      if (!isPublishedSup && !isCurrentSup && !isHead && !isAdminSign) {
        throw new ForbiddenException(
          '您不是该员工的上级、部门负责人或系统管理员，无法签署上级签名',
        );
      }
    }

    const now: Date = new Date();
    let newStatus = 'pending_sign';

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

      // 事务内二次校验状态
      if (current.status !== 'pending_sign') {
        throw new BadRequestException('当前状态不允许签名，请先完成评分');
      }

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

        // 身份校验
        const supRows = await tx
          .select({
            supervisorId: employee.supervisorId,
            empDepartment: employee.department,
          })
          .from(employee)
          .where(
            and(
              sql`(${employee.id}).user_id = ${current.employeeId}`,
              isNull(employee.deletedAt),
            ),
          )
          .limit(1);

        if (supRows.length === 0) {
          throw new ForbiddenException('员工信息不存在，无法签署上级签名');
        }

        const isPublishedSup =
          !!current.supervisorId && current.supervisorId === userId;
        const isCurrentSup = supRows[0].supervisorId === userId;
        let isHead = false;
        if (!isPublishedSup && !isCurrentSup) {
          const deptRows = await tx
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

        let isAdminSign = false;
        if (!isPublishedSup && !isCurrentSup && !isHead) {
          const adminCheck = await tx
            .select({ id: employee.id })
            .from(employee)
            .where(
              and(
                sql`(${employee.id}).user_id = ${userId}`,
                eq(employee.role, 'admin'),
                isNull(employee.deletedAt),
              ),
            )
            .limit(1);
          isAdminSign = adminCheck.length > 0;
        }

        if (!isPublishedSup && !isCurrentSup && !isHead && !isAdminSign) {
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

      // 双方都已签名时将状态推进到 completed
      const completedResult = await tx
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
        )
        .returning({ status: assessmentInstance.status });

      if (completedResult.length > 0) {
        newStatus = 'completed';
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

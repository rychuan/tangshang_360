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
import { eq, and, isNull } from 'drizzle-orm';
import {
  assessmentInstance,
  auditLog,
  employee,
  assessmentSignSession,
} from '@server/database/schema';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { getStatusAfterSign } from '@server/common/assessment/workflow';
import type {
  SignSessionResponse,
  SignStatusResponse,
  SignSubmissionResponse,
} from '@shared/api.interface';
import {
  hashSignToken,
  resolveSignSessionStatus,
  validateSignImage,
} from './sign-session.utils';

/**
 * 移动端签名会话域：token 查询 / 状态查询 / 一次性签名消费。
 * 与 in-app 签名（AssessmentOperationService.sign）共享 sign-session.utils 状态机，
 * 但只依赖 db + AccessScopeService，不依赖考核详情/评分域。
 */
@Injectable()
export class SignSessionService {
  private readonly logger = new Logger(SignSessionService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async getSignSession(
    token: string,
    userId: string,
  ): Promise<SignSessionResponse> {
    const sessionRows = await this.db
      .select()
      .from(assessmentSignSession)
      .where(eq(assessmentSignSession.tokenHash, hashSignToken(token)))
      .limit(1);

    if (sessionRows.length === 0) {
      return {
        status: 'invalid',
        instanceId: '',
        signType: 'self',
        employeeName: '',
        period: '',
      };
    }

    const session = sessionRows[0];
    const instanceRows = await this.db
      .select({
        id: assessmentInstance.id,
        period: assessmentInstance.period,
        employeeId: assessmentInstance.employeeId,
        status: assessmentInstance.status,
        selfSignName: assessmentInstance.selfSignName,
        supervisorSignName: assessmentInstance.supervisorSignName,
      })
      .from(assessmentInstance)
      .where(eq(assessmentInstance.id, session.instanceId))
      .limit(1);

    const instance = instanceRows[0] ?? null;
    const status = resolveSignSessionStatus(
      {
        ...session,
        signType: session.signType as 'self' | 'supervisor',
      },
      instance,
      userId,
    );

    if (
      session.status === 'pending' &&
      (status === 'expired' || status === 'failed' || status === 'succeeded')
    ) {
      await this.db
        .update(assessmentSignSession)
        .set({
          status,
          consumedAt: status === 'succeeded' ? new Date() : null,
          failureReason:
            status === 'failed' ? '考核流程状态已变化' : null,
        })
        .where(
          and(
            eq(assessmentSignSession.id, session.id),
            eq(assessmentSignSession.status, 'pending'),
          ),
        );
    }

    if (status !== 'pending' || !instance) {
      return {
        status,
        instanceId: status === 'succeeded' ? session.instanceId : '',
        signType: session.signType as 'self' | 'supervisor',
        employeeName: '',
        period: '',
      };
    }

    const empRows = await this.db
      .select({ name: employee.name })
      .from(employee)
      .where(
        and(
          eq(employee.employeeId, instance.employeeId),
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    return {
      status,
      instanceId: session.instanceId,
      signType: session.signType as 'self' | 'supervisor',
      employeeName: empRows[0]?.name || '',
      period: instance.period,
    };
  }

  async getSignStatus(
    token: string,
    userId: string,
  ): Promise<SignStatusResponse> {
    const session = await this.getSignSession(token, userId);
    return {
      signed: session.status === 'succeeded',
      status: session.status,
    };
  }

  async signByToken(
    token: string,
    userId: string,
    userName: string,
    signImage?: string,
  ): Promise<SignSubmissionResponse> {
    const effectiveSignName = userName?.trim() || '';
    if (!effectiveSignName) {
      throw new BadRequestException('签名姓名不能为空');
    }
    if (effectiveSignName.length > 255) {
      throw new BadRequestException('签名姓名不能超过255个字符');
    }
    const validatedSignImage = validateSignImage(signImage);

    const now: Date = new Date();
    const accessScope = await this.accessScopeService.getScope(userId);
    const result = await this.db.transaction(async (tx) => {
      const sessionRows = await tx
        .select()
        .from(assessmentSignSession)
        .where(
          eq(assessmentSignSession.tokenHash, hashSignToken(token)),
        )
        .for('update')
        .limit(1);

      if (sessionRows.length === 0) {
        return { success: false, status: 'invalid' } as SignSubmissionResponse;
      }

      const session = sessionRows[0];
      const instanceRows = await tx
        .select({
          status: assessmentInstance.status,
          selfSignName: assessmentInstance.selfSignName,
          supervisorSignName: assessmentInstance.supervisorSignName,
          employeeId: assessmentInstance.employeeId,
          supervisorId: assessmentInstance.supervisorId,
        })
        .from(assessmentInstance)
        .where(eq(assessmentInstance.id, session.instanceId))
        .for('update')
        .limit(1);

      if (instanceRows.length === 0) {
        return { success: false, status: 'invalid' } as SignSubmissionResponse;
      }

      const current = instanceRows[0];
      const sessionStatus = resolveSignSessionStatus(
        {
          ...session,
          signType: session.signType as 'self' | 'supervisor',
        },
        current,
        userId,
        now,
      );

      if (sessionStatus !== 'pending') {
        if (
          session.status === 'pending' &&
          sessionStatus !== 'forbidden' &&
          sessionStatus !== 'invalid'
        ) {
          await tx
            .update(assessmentSignSession)
            .set({
              status: sessionStatus,
              consumedAt: sessionStatus === 'succeeded' ? now : null,
              failureReason:
                sessionStatus === 'failed' ? '考核流程状态已变化' : null,
            })
            .where(eq(assessmentSignSession.id, session.id));
        }
        return {
          success: sessionStatus === 'succeeded',
          status: sessionStatus,
        } as SignSubmissionResponse;
      }

      const signType = session.signType as 'self' | 'supervisor';
      const newStatus = getStatusAfterSign(current.status, signType);

      if (signType === 'self') {
        if (current.employeeId !== userId) {
          return {
            success: false,
            status: 'forbidden',
          } as SignSubmissionResponse;
        }
        await tx
          .update(assessmentInstance)
          .set({
            selfSignName: effectiveSignName,
            selfSignAt: now,
            selfSignImage: validatedSignImage,
            status: newStatus,
          })
          .where(eq(assessmentInstance.id, session.instanceId));
      } else {
        if (!current.selfSignName) {
          return { success: false, status: 'failed' } as SignSubmissionResponse;
        }

        const empRows = await tx
          .select({
            supervisorId: employee.supervisorId,
          })
          .from(employee)
          .where(
            and(
              eq(employee.employeeId, current.employeeId),
              isNull(employee.deletedAt),
            ),
          )
          .limit(1);
        const scope = accessScope;
        const canOperate =
          scope.kind === 'global' ||
          current.supervisorId === userId ||
          empRows[0]?.supervisorId === userId;
        if (!canOperate) {
          return {
            success: false,
            status: 'forbidden',
          } as SignSubmissionResponse;
        }

        await tx
          .update(assessmentInstance)
          .set({
            supervisorSignName: effectiveSignName,
            supervisorSignAt: now,
            supervisorSignImage: validatedSignImage,
            status: newStatus,
            completedAt: now,
          })
          .where(eq(assessmentInstance.id, session.instanceId));
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: `sign_${signType}_by_token`,
        targetType: 'assessment_instance',
        targetId: session.instanceId,
      });

      await tx
        .update(assessmentSignSession)
        .set({
          status: 'succeeded',
          consumedAt: now,
          failureReason: null,
        })
        .where(eq(assessmentSignSession.id, session.id));

      return {
        success: true,
        status: 'succeeded',
      } as SignSubmissionResponse;
    });

    this.logger.log(
      `Sign by token for user ${userId}, status=${result.status}`,
    );

    return result;
  }
}

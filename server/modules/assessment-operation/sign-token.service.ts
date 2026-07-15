import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CapabilityService,
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { assessmentSignSession } from '@server/database/schema';
import { hashSignToken } from './sign-session.utils';

interface TokenPayload {
  instanceId: string;
  signType: 'self' | 'supervisor';
  userId: string;
  userName: string;
}

@Injectable()
export class SignTokenService {
  private readonly logger = new Logger(SignTokenService.name);
  private readonly TOKEN_TTL_MS = 5 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly capabilityService: CapabilityService,
  ) {}

  async generateToken(payload: TokenPayload): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.db.insert(assessmentSignSession).values({
      tokenHash: hashSignToken(token),
      instanceId: payload.instanceId,
      signType: payload.signType,
      userId: payload.userId,
      userName: payload.userName,
      status: 'pending',
      expiresAt: new Date(Date.now() + this.TOKEN_TTL_MS),
    });
    return token;
  }

  async getSession(token: string) {
    const rows = await this.db
      .select()
      .from(assessmentSignSession)
      .where(eq(assessmentSignSession.tokenHash, hashSignToken(token)))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db
      .delete(assessmentSignSession)
      .where(
        and(
          eq(assessmentSignSession.tokenHash, hashSignToken(token)),
          eq(assessmentSignSession.status, 'pending'),
        ),
      );
  }

  async sendSignMessage(
    userId: string,
    signUrl: string,
    period: string,
    signType: 'self' | 'supervisor',
    employeeName: string,
  ): Promise<void> {
    const signTypeLabel = signType === 'self' ? '本人签名' : '上级签名';
    const markdown = [
      `**📋 签名待办**`,
      ``,
      `**绩效周期**：${period}`,
      `**签名对象**：${employeeName}`,
      `**签名类型**：${signTypeLabel}`,
      ``,
      `[📝 去手机签名](${signUrl})`,
    ].join('\n');

    try {
      await this.capabilityService
        .load('assessment_reminder_feishu_send_1')
        .call('send_feishu_message', {
          receiverUserList: [userId],
          cardContentMarkdown: markdown,
        });
      this.logger.log(`Sign message sent to ${userId}`);
    } catch (err) {
      this.logger.warn(`Failed to send sign message to ${userId}: ${err}`);
      throw err;
    }
  }
}

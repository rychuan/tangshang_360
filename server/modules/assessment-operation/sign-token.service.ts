import { Injectable, Logger } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { randomBytes } from 'crypto';

interface TokenPayload {
  instanceId: string;
  signType: 'self' | 'supervisor';
  userId: string;
  userName: string;
  expiresAt: number;
}

@Injectable()
export class SignTokenService {
  private readonly logger = new Logger(SignTokenService.name);
  private readonly tokens = new Map<string, TokenPayload>();
  private readonly TOKEN_TTL_MS = 5 * 60 * 1000;

  constructor(private readonly capabilityService: CapabilityService) {}

  generateToken(payload: Omit<TokenPayload, 'expiresAt'>): string {
    this.cleanExpired();
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, {
      ...payload,
      expiresAt: Date.now() + this.TOKEN_TTL_MS,
    });
    return token;
  }

  validateToken(token: string): TokenPayload | null {
    this.cleanExpired();
    const payload = this.tokens.get(token);
    if (!payload) return null;
    if (Date.now() > payload.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return payload;
  }

  consumeToken(token: string): TokenPayload | null {
    const payload = this.validateToken(token);
    if (payload) {
      this.tokens.delete(token);
    }
    return payload;
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
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [token, payload] of this.tokens) {
      if (now > payload.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }
}

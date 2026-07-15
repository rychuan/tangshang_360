import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { isSignAllowedInStatus } from '@server/common/assessment/workflow';
import type { SignSessionStatus } from '@shared/api.interface';

const SIGN_IMAGE_PATTERN =
  /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_SIGN_IMAGE_BYTES = 1024 * 1024;

export function hashSignToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function validateSignImage(signImage: string | undefined): string {
  if (!signImage) {
    throw new BadRequestException('签名图片不能为空');
  }

  const match = SIGN_IMAGE_PATTERN.exec(signImage);
  if (!match) {
    if (!/^data:image\/(png|jpeg);base64,/.test(signImage)) {
      throw new BadRequestException('签名图片格式无效，仅支持 PNG 或 JPEG');
    }
    throw new BadRequestException('签名图片数据无效');
  }

  const base64 = match[2];
  if (base64.length % 4 !== 0) {
    throw new BadRequestException('签名图片数据无效');
  }

  const decoded = Buffer.from(base64, 'base64');
  if (
    decoded.length === 0 ||
    decoded.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')
  ) {
    throw new BadRequestException('签名图片数据无效');
  }
  if (decoded.length > MAX_SIGN_IMAGE_BYTES) {
    throw new BadRequestException('签名图片不能超过 1 MiB');
  }

  return signImage;
}

type SessionStateInput = {
  userId: string;
  signType: 'self' | 'supervisor';
  status: string;
  expiresAt: Date;
};

type InstanceStateInput = {
  status: string;
  selfSignName: string | null;
  supervisorSignName: string | null;
};

export function resolveSignSessionStatus(
  session: SessionStateInput | null,
  instance: InstanceStateInput | null,
  userId: string,
  now: Date = new Date(),
): SignSessionStatus {
  if (!session || !instance) {
    return 'invalid';
  }
  if (session.userId !== userId) {
    return 'forbidden';
  }

  const signatureExists =
    session.signType === 'self'
      ? !!instance.selfSignName
      : !!instance.supervisorSignName;
  if (signatureExists) {
    return 'succeeded';
  }
  if (session.status === 'succeeded') {
    return 'failed';
  }
  if (session.status === 'failed') {
    return 'failed';
  }
  if (session.status === 'expired' || now > session.expiresAt) {
    return 'expired';
  }
  if (!isSignAllowedInStatus(instance.status, session.signType)) {
    return 'failed';
  }
  return 'pending';
}

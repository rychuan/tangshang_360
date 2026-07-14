import { BadRequestException } from '@nestjs/common';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(id: string, label = 'id'): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException(`${label} 格式无效`);
  }
}

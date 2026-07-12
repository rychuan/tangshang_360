import { BadRequestException } from '@nestjs/common';

export const DEFAULT_BATCH_LIMIT = 100;

export function assertBatchSize<T>(
  items: T[] | undefined,
  label: string,
  limit: number = DEFAULT_BATCH_LIMIT,
): asserts items is T[] {
  if (!items || items.length === 0) {
    throw new BadRequestException(`${label}不能为空`);
  }
  if (items.length > limit) {
    throw new BadRequestException(`${label}数量不能超过 ${limit}`);
  }
}

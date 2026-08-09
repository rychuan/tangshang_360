import { BadRequestException } from '@nestjs/common';

export const DEFAULT_BATCH_LIMIT = 100;

/** 以固定并发度执行异步任务（按批次分组，每批并发执行） */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
}

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

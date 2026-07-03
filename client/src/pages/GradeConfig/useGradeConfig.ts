import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import * as performanceGradeApi from '@client/src/api/performance-grade';
import type {
  PerformanceGradeItem,
  CreatePerformanceGradeRequest,
} from '@shared/api.interface';

export interface CoverageResult {
  covered: boolean;
  message: string;
}

export function checkCoverage(grades: PerformanceGradeItem[]): CoverageResult {
  const active = grades
    .filter((g) => g.isActive)
    .sort((a, b) => a.minScore - b.minScore);
  if (active.length === 0) {
    return { covered: false, message: '无启用的等级规则' };
  }
  if (active[0].minScore !== 0) {
    return { covered: false, message: '最低等级的起始分应为0' };
  }
  for (let i = 0; i < active.length - 1; i++) {
    const curr = active[i];
    const next = active[i + 1];
    if (curr.maxScore >= next.minScore) {
      return {
        covered: false,
        message: `等级「${curr.name}」(区间[${curr.minScore}, ${curr.maxScore}])与等级「${next.name}」(区间[${next.minScore}, ${next.maxScore}])分数区间重叠`,
      };
    }
    if (curr.maxScore + 1 < next.minScore) {
      return {
        covered: false,
        message: `等级「${curr.name}」(最高分${curr.maxScore})与等级「${next.name}」(最低分${next.minScore})之间存在未覆盖的分数区间`,
      };
    }
  }
  if (active[active.length - 1].maxScore < 150) {
    return { covered: false, message: '最高等级的截止分应至少为150' };
  }
  return { covered: true, message: '当前配置已完整覆盖0-150分区间' };
}

export function useGradeConfig() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PerformanceGradeItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await performanceGradeApi.list();
      setItems(res?.items ?? []);
    } catch (err: unknown) {
      logger.error(
        'fetchGradeList error:',
        err instanceof Error ? err.message : '加载失败',
      );
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const createGrade = useCallback(
    async (data: CreatePerformanceGradeRequest): Promise<boolean> => {
      setSubmitting(true);
      try {
        await performanceGradeApi.create(data);
        toast.success('等级配置创建成功');
        await fetchList();
        return true;
      } catch (err: unknown) {
        logger.error(
          'createGrade error:',
          err instanceof Error ? err.message : '创建失败',
        );
        handleApiError(err);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchList],
  );

  const updateGrade = useCallback(
    async (
      id: string,
      data: CreatePerformanceGradeRequest,
    ): Promise<boolean> => {
      setSubmitting(true);
      try {
        await performanceGradeApi.update(id, data);
        toast.success('等级配置更新成功');
        await fetchList();
        return true;
      } catch (err: unknown) {
        logger.error(
          'updateGrade error:',
          err instanceof Error ? err.message : '更新失败',
        );
        handleApiError(err);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchList],
  );

  const deleteGrade = useCallback(
    async (id: string): Promise<boolean> => {
      setSubmitting(true);
      try {
        await performanceGradeApi.remove(id);
        toast.success('等级配置已删除');
        await fetchList();
        return true;
      } catch (err: unknown) {
        logger.error(
          'deleteGrade error:',
          err instanceof Error ? err.message : '删除失败',
        );
        handleApiError(err);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [fetchList],
  );

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const coverage = checkCoverage(items);

  return {
    items,
    loading,
    submitting,
    sortedItems,
    coverage,
    fetchList,
    createGrade,
    updateGrade,
    deleteGrade,
  };
}

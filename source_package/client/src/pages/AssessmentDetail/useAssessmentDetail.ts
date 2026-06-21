import { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as assessmentOperation from '@client/src/api/assessment-operation';
import type { AssessmentInstanceDetail } from '@shared/api.interface';
import {
  type RatingsState,
  type DimensionGroup,
  buildRatingPayload,
  calculatePreviewScore,
} from './assessment-utils';

export function useAssessmentDetail(
  id: string | undefined,
  isSupervisorView: boolean,
  currentUserId: string | undefined,
) {
  const [detail, setDetail] =
    useState<AssessmentInstanceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [ratings, setRatings] = useState<RatingsState>({});

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await assessmentOperation.detail(id);
      setDetail(data);

      const initial: RatingsState = {};
      for (const ind of data.indicators) {
        const score =
          data.status === 'self_review'
            ? ind.selfScore
            : data.status === 'supervisor_review'
              ? ind.supervisorScore
              : undefined;
        const comment =
          data.status === 'self_review'
            ? ind.selfComment
            : data.status === 'supervisor_review'
              ? ind.supervisorComment
              : undefined;
        initial[ind.id] = {
          score: score ?? 0,
          comment: comment ?? '',
        };
      }
      setRatings(initial);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '加载失败';
      logger.error('Failed to fetch detail:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const isEmployee: boolean =
    !isSupervisorView &&
    !!currentUserId &&
    !!detail &&
    currentUserId === detail.employeeId;
  const isSupervisor: boolean =
    !!currentUserId &&
    !!detail &&
    currentUserId === detail.supervisorId &&
    (isSupervisorView || !isEmployee);

  const canEditSelf: boolean =
    detail?.status === 'self_review' && isEmployee;
  const canEditSupervisor: boolean =
    detail?.status === 'supervisor_review' && isSupervisor;
  const canSignSelf: boolean =
    detail?.status === 'pending_sign' &&
    isEmployee &&
    !detail.selfSignName;
  const canSignSupervisor: boolean =
    detail?.status === 'pending_sign' &&
    isSupervisor &&
    !detail.supervisorSignName;
  const isCompleted: boolean = detail?.status === 'completed';

  const groupedIndicators = useMemo<DimensionGroup[]>(() => {
    if (!detail) return [];
    const groups: Record<string, DimensionGroup> = {};
    for (const ind of detail.indicators) {
      if (!groups[ind.dimensionName]) {
        groups[ind.dimensionName] = {
          dimensionName: ind.dimensionName,
          dimensionWeight: ind.dimensionWeight,
          indicators: [],
        };
      }
      groups[ind.dimensionName].indicators.push(ind);
    }
    return Object.values(groups);
  }, [detail]);

  const preview = useMemo(() => {
    if (!canEditSupervisor) return null;
    return calculatePreviewScore(ratings, groupedIndicators);
  }, [canEditSupervisor, ratings, groupedIndicators]);

  const updateRating = useCallback(
    (
      indicatorId: string,
      field: 'score' | 'comment',
      value: string,
      maxScore?: number,
    ) => {
      setRatings((prev) => ({
        ...prev,
        [indicatorId]: {
          ...prev[indicatorId],
          [field]:
            field === 'score'
              ? Math.min(Number(value) || 0, maxScore ?? Infinity)
              : value,
        },
      }));
    },
    [],
  );

  const handleSaveDraft = async () => {
    if (!id || !detail) return;
    setSubmitting(true);
    try {
      const body = { ...buildRatingPayload(ratings), isDraft: true };
      if (detail.status === 'self_review') {
        await assessmentOperation.submitSelfRating(id, body);
      } else if (detail.status === 'supervisor_review') {
        await assessmentOperation.submitSupervisorRating(id, body);
      }
      toast.success('草稿已保存');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '保存失败';
      logger.error('Save draft failed:', msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!id || !detail) return;
    setSubmitting(true);
    try {
      const body = { ...buildRatingPayload(ratings), isDraft: false };
      if (detail.status === 'self_review') {
        await assessmentOperation.submitSelfRating(id, body);
        toast.success('自评已提交');
      } else if (detail.status === 'supervisor_review') {
        const result =
          await assessmentOperation.submitSupervisorRating(id, body);
        toast.success(
          `评分已提交，总分 ${result.totalScore}，等级 ${result.grade}`,
        );
      }
      await fetchDetail();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '提交失败';
      logger.error('Submit failed:', msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    detail,
    loading,
    error,
    submitting,
    ratings,
    groupedIndicators,
    canEditSelf,
    canEditSupervisor,
    canSignSelf,
    canSignSupervisor,
    isCompleted,
    previewScore: preview?.score ?? null,
    previewGrade: preview?.grade ?? null,
    fetchDetail,
    updateRating,
    handleSaveDraft,
    handleSubmit,
  };
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as assessmentOperation from '@client/src/api/assessment-operation';
import * as performanceGradeApi from '@client/src/api/performance-grade';
import type {
  AssessmentInstanceDetail,
  ActiveGradeRule,
} from '@shared/api.interface';
import {
  type RatingsState,
  type DimensionGroup,
  buildRatingPayload,
  calculatePreviewScore,
  getScoreCoefficientWarnings,
  matchGradeLocally,
} from './assessment-utils';
import { handleApiError } from '@client/src/utils/api-error';
import { usePermission } from '@client/src/hooks/usePermissions';

const GRADE_STYLE_TIERS = [
  'bg-destructive/10 text-destructive',
  'bg-warning/10 text-warning',
  'bg-primary/10 text-primary',
  'bg-success/10 text-success',
  'bg-success/20 text-success font-semibold',
];

function buildGradeStyleMap(rules: ActiveGradeRule[]): Record<string, string> {
  const map: Record<string, string> = {};
  const tierCount = GRADE_STYLE_TIERS.length;
  for (let i = 0; i < rules.length; i++) {
    const tierIndex =
      rules.length <= tierCount
        ? i
        : Math.floor((i / (rules.length - 1)) * (tierCount - 1));
    map[rules[i].name] = GRADE_STYLE_TIERS[tierIndex];
  }
  return map;
}

export function useAssessmentDetail(
  id: string | undefined,
  currentUserId: string | undefined,
) {
  const [detail, setDetail] = useState<AssessmentInstanceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [ratings, setRatings] = useState<RatingsState>({});
  const [gradeRules, setGradeRules] = useState<ActiveGradeRule[]>([]);
  const canEditAssessment = usePermission('my_assessments', 'edit');

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
          score: score ?? undefined,
          completionStatus: ind.selfCompletionStatus ?? '',
          comment: comment ?? '',
        };
      }
      setRatings(initial);
    } catch (err: unknown) {
      logger.error('Failed to fetch detail:', err);
      setDetail(null);
      handleApiError(err);
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    performanceGradeApi
      .listActive()
      .then((res) => setGradeRules(res?.rules ?? []))
      .catch(() => {
        // 非关键数据，静默失败
      });
  }, []);

  const isEmployeeCandidate =
    !!currentUserId && !!detail && currentUserId === detail.employeeId;
  const isEmployee: boolean = isEmployeeCandidate;

  const canEditSelf: boolean = detail?.status === 'self_review' && isEmployee;
  // 上级评分/签名必须同时满足后端身份判定、资源编辑权限和流程状态。
  const canEditSupervisor: boolean =
    detail?.status === 'supervisor_review' &&
    detail.canSupervisorOperate &&
    canEditAssessment;

  useEffect(() => {
    if (detail) {
      logger.info(
        `[Permission] status=${detail.status} isEmployee=${isEmployeeCandidate} canSupervisorOperate=${detail.canSupervisorOperate} canEditSupervisor=${canEditSupervisor} userId=${currentUserId} empId=${detail.employeeId} supId=${detail.supervisorId}`,
      );
    }
  }, [detail, isEmployeeCandidate, canEditSupervisor, currentUserId]);
  const isCompleted: boolean = detail?.status === 'completed';

  const groupedIndicators = useMemo<DimensionGroup[]>(() => {
    if (!detail || !Array.isArray(detail.indicators)) return [];
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
    if (!canEditSupervisor || gradeRules.length === 0) return null;
    return calculatePreviewScore(ratings, groupedIndicators, gradeRules);
  }, [canEditSupervisor, ratings, groupedIndicators, gradeRules]);

  const scoreWarningIndicators = useMemo(
    () => getScoreCoefficientWarnings(ratings, groupedIndicators),
    [ratings, groupedIndicators],
  );

  const gradeStyleMap = useMemo(
    () => buildGradeStyleMap(gradeRules),
    [gradeRules],
  );

  const updateRating = useCallback(
    (
      indicatorId: string,
      field: 'score' | 'completionStatus' | 'comment',
      value: string,
    ) => {
      const nextValue =
        field === 'score' && value !== ''
          ? Math.max(0, Number(value) || 0)
          : value;
      setRatings((prev) => ({
        ...prev,
        [indicatorId]: {
          ...prev[indicatorId],
          [field]:
            field === 'score'
              ? nextValue === ''
                ? undefined
                : Number(nextValue) || 0
              : nextValue,
        },
      }));
    },
    [],
  );

  const handleSaveDraft = async (options?: { successMessage?: string }) => {
    if (!id || !detail) return;
    setSubmitting(true);
    try {
      const body = { ...buildRatingPayload(ratings), isDraft: true };
      if (detail.status === 'self_review') {
        await assessmentOperation.submitSelfRating(id, body);
      } else if (detail.status === 'supervisor_review') {
        await assessmentOperation.submitSupervisorRating(id, body);
      }
      toast.success(options?.successMessage ?? '草稿已保存');
      return true;
    } catch (err: unknown) {
      logger.error('Save draft failed:', err);
      handleApiError(err);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (options?: { confirmedScoreWarning?: boolean }) => {
    if (!id || !detail) return;

    // 提交前校验：所有指标必须已填写分数
    const emptyIndicators: string[] = [];
    for (const group of groupedIndicators) {
      for (const ind of group.indicators) {
        const s = ratings[ind.id]?.score;
        if (s == null) {
          emptyIndicators.push(
            ind.content.length > 12
              ? ind.content.slice(0, 12) + '…'
              : ind.content,
          );
        }
      }
    }
    if (emptyIndicators.length > 0) {
      const names = emptyIndicators.slice(0, 3).join('、');
      const suffix = emptyIndicators.length > 3 ? '等' : '';
      toast.warning(
        `以下 ${emptyIndicators.length} 项指标未评分：${names}${suffix}，请填写后提交`,
      );
      return;
    }

    if (detail.status === 'self_review') {
      const emptyCompletionIndicators: string[] = [];
      for (const group of groupedIndicators) {
        for (const ind of group.indicators) {
          const completionStatus = ratings[ind.id]?.completionStatus;
          if (!completionStatus?.trim()) {
            emptyCompletionIndicators.push(
              ind.content.length > 12
                ? ind.content.slice(0, 12) + '…'
                : ind.content,
            );
          }
        }
      }
      if (emptyCompletionIndicators.length > 0) {
        const names = emptyCompletionIndicators.slice(0, 3).join('、');
        const suffix = emptyCompletionIndicators.length > 3 ? '等' : '';
        toast.warning(
          `以下 ${emptyCompletionIndicators.length} 项指标未填写完成情况：${names}${suffix}，请填写后提交`,
        );
        return;
      }
    }

    if (
      scoreWarningIndicators.length > 0 &&
      !options?.confirmedScoreWarning
    ) {
      return { needsScoreWarningConfirm: true };
    }

    if (detail.status === 'self_review') {
      return { readyToSign: true, signType: 'self' as const };
    }
    if (detail.status === 'supervisor_review') {
      return { readyToSign: true, signType: 'supervisor' as const };
    }
  };

  const handleSubmitWithSign = async (
    signType: 'self' | 'supervisor',
    signImage: string,
  ) => {
    if (!id || !detail) return;
    setSubmitting(true);
    try {
      const body = {
        ...buildRatingPayload(ratings),
        isDraft: false,
        signName:
          signType === 'self'
            ? detail.employeeName || ''
            : detail.supervisorName || '',
        signImage,
      };
      if (signType === 'self') {
        await assessmentOperation.submitSelfRatingWithSign(id, body);
        toast.success('自评和签名已提交');
      } else {
        const result = await assessmentOperation.submitSupervisorRatingWithSign(
          id,
          body,
        );
        toast.success(
          `评分和签名已提交，总分 ${result.totalScore}，等级 ${result.grade}`,
        );
      }
      await fetchDetail();
      return true;
    } catch (err: unknown) {
      logger.error('Submit with sign failed:', err);
      handleApiError(err);
      return false;
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
    scoreWarningIndicators,
    groupedIndicators,
    canEditSelf,
    canEditSupervisor,
    isCompleted,
    previewScore: preview?.score ?? null,
    previewGrade: preview?.grade ?? null,
    gradeStyleMap,
    fetchDetail,
    updateRating,
    handleSaveDraft,
    handleSubmit,
    handleSubmitWithSign,
  };
}

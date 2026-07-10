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
  matchGradeLocally,
} from './assessment-utils';
import { handleApiError } from '@client/src/utils/api-error';

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
  isSupervisorView: boolean,
  currentUserId: string | undefined,
) {
  const [detail, setDetail] = useState<AssessmentInstanceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [ratings, setRatings] = useState<RatingsState>({});
  const [gradeRules, setGradeRules] = useState<ActiveGradeRule[]>([]);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await assessmentOperation.detail(id);
      if (!data || !Array.isArray(data.indicators)) {
        throw new Error('接口返回数据格式异常');
      }
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
  const isSupervisorCandidate =
    !!currentUserId && !!detail && currentUserId === detail.supervisorId;

  // 员工身份仅基于 identity 匹配，不受 ?view 参数影响
  const isEmployee: boolean = isEmployeeCandidate;
  // 上级身份：是发布时上级 AND (显式要求上级视角 OR 不是被评估人本人)
  const isSupervisor: boolean =
    isSupervisorCandidate && (isSupervisorView || !isEmployeeCandidate);

  const canEditSelf: boolean = detail?.status === 'self_review' && isEmployee;
  // 上级评分/签名：非员工本人 OR 员工本人即发布上级时允许操作，
  // 最终权限由后端校验（支持发布上级/当前上级/部门负责人三种身份）
  const canEditSupervisor: boolean =
    detail?.status === 'supervisor_review' &&
    (!isEmployeeCandidate || isSupervisorCandidate);

  useEffect(() => {
    if (detail) {
      logger.info(
        `[Permission] status=${detail.status} isEmployee=${isEmployeeCandidate} canEditSupervisor=${canEditSupervisor} userId=${currentUserId} empId=${detail.employeeId} supId=${detail.supervisorId}`,
      );
    }
  }, [detail, isEmployeeCandidate, canEditSupervisor, currentUserId]);
  // 上级签名：非员工本人 OR 员工本人即发布上级时允许操作，
  // 最终权限由后端校验（支持发布上级/当前上级/部门负责人/admin 四种身份）
  const canSignSupervisor: boolean =
    detail?.status === 'pending_sign' &&
    (!isEmployeeCandidate || isSupervisorCandidate) &&
    !detail.supervisorSignName;
  const canSignSelf: boolean =
    detail?.status === 'pending_sign' && isEmployee && !detail.selfSignName;
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

  const gradeStyleMap = useMemo(
    () => buildGradeStyleMap(gradeRules),
    [gradeRules],
  );

  const updateRating = useCallback(
    (
      indicatorId: string,
      field: 'score' | 'comment',
      value: string,
      weight?: number,
    ) => {
      const nextValue =
        field === 'score' && value !== ''
          ? Math.max(
              0,
              Math.min(
                Number(value) || 0,
                weight ?? Number.POSITIVE_INFINITY,
              ),
            )
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
      logger.error('Save draft failed:', err);
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
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

    const overLimitIndicators: string[] = [];
    for (const group of groupedIndicators) {
      for (const ind of group.indicators) {
        const s = ratings[ind.id]?.score;
        if (s != null && s > ind.weight) {
          overLimitIndicators.push(
            ind.content.length > 12
              ? ind.content.slice(0, 12) + '…'
              : ind.content,
          );
        }
      }
    }
    if (overLimitIndicators.length > 0) {
      const names = overLimitIndicators.slice(0, 3).join('、');
      const suffix = overLimitIndicators.length > 3 ? '等' : '';
      toast.warning(
        `以下 ${overLimitIndicators.length} 项指标超过权重分：${names}${suffix}，请调整后提交`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const body = { ...buildRatingPayload(ratings), isDraft: false };
      if (detail.status === 'self_review') {
        await assessmentOperation.submitSelfRating(id, body);
        toast.success('自评已提交');
      } else if (detail.status === 'supervisor_review') {
        const result = await assessmentOperation.submitSupervisorRating(
          id,
          body,
        );
        toast.success(
          `评分已提交，总分 ${result.totalScore}，等级 ${result.grade}`,
        );
      }
      await fetchDetail();
    } catch (err: unknown) {
      logger.error('Submit failed:', err);
      handleApiError(err);
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
    gradeStyleMap,
    fetchDetail,
    updateRating,
    handleSaveDraft,
    handleSubmit,
  };
}

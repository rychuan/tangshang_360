import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { useBreadcrumb } from '@/components/business-ui/breadcrumb-context';
import {
  ArrowLeft,
  Save,
  Send,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from '@/components/business-ui/status-badge';
import { UserDisplay } from '@/components/business-ui/user-display';
import { useAssessmentDetail } from './useAssessmentDetail';
import IndicatorTable from './IndicatorTable';
import SignDialog from './SignDialog';

function getGradeStyle(
  grade: string | undefined | null,
  styleMap?: Record<string, string>,
): string {
  if (!grade) return '';
  if (styleMap?.[grade]) return styleMap[grade];
  return 'bg-muted text-muted-foreground';
}

function sumScores(
  indicators: Array<{ selfScore?: number; supervisorScore?: number }>,
  type: 'self' | 'supervisor',
): number | null {
  const scores = indicators
    .map((indicator) =>
      type === 'self' ? indicator.selfScore : indicator.supervisorScore,
    )
    .filter((score): score is number => score != null);

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) * 100) / 100;
}

const AssessmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSupervisorView = searchParams.get('view') === 'supervisor';
  const currentUser = useCurrentUserProfile();
  const currentUserId: string | undefined = currentUser?.user_id;

  const {
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
    previewScore,
    previewGrade,
    gradeStyleMap,
    updateRating,
    handleSaveDraft,
    handleSubmit,
    handleSubmitWithSign,
  } = useAssessmentDetail(id, isSupervisorView, currentUserId);

  const { setLabel } = useBreadcrumb();
  useEffect(() => {
    setLabel('绩效详情');
    document.title = '绩效详情 - 绩效考核';
    if (detail) {
      const label = `${detail.employeeName} · ${detail.period}`;
      setLabel(label);
      document.title = `${label} - 绩效考核`;
    }
    return () => {
      setLabel(null);
      document.title = '绩效考核';
    };
  }, [detail, setLabel]);

  const [signDialogOpen, setSignDialogOpen] = useState<boolean>(false);
  const [scoreWarningDialogOpen, setScoreWarningDialogOpen] =
    useState<boolean>(false);
  const [signType, setSignType] = useState<'self' | 'supervisor'>('self');
  const [signImage, setSignImage] = useState<string | null>(null);

  const handleOpenSignDialog = (type: 'self' | 'supervisor') => {
    setSignType(type);
    setSignImage(null);
    setSignDialogOpen(true);
  };

  const handleSubmitClick = async () => {
    const result = await handleSubmit();
    if (result?.needsScoreWarningConfirm) {
      setScoreWarningDialogOpen(true);
      return;
    }
    if (result?.readyToSign) {
      handleOpenSignDialog(result.signType);
    }
  };

  const handleConfirmScoreWarningSubmit = async () => {
    setScoreWarningDialogOpen(false);
    const result = await handleSubmit({ confirmedScoreWarning: true });
    if (result?.readyToSign) {
      handleOpenSignDialog(result.signType);
    }
  };

  const handleSign = async () => {
    if (!id || !signImage) return;
    const success = await handleSubmitWithSign(signType, signImage);
    if (success) {
      setSignDialogOpen(false);
      setSignImage(null);
    }
  };

  const handleCancelSign = async () => {
    setSignDialogOpen(false);
    setSignImage(null);
    await handleSaveDraft({
      successMessage: '已保存草稿，签名确认后才会提交',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">{error || '绩效记录不存在'}</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    );
  }

  const hasFinalScore = detail.totalScore != null;
  const showPreview = !hasFinalScore && previewScore != null;
  const selfScore = sumScores(detail.indicators, 'self');
  const supervisorScore =
    detail.totalScore ?? sumScores(detail.indicators, 'supervisor');

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar: back + period + status + score */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-1.5"
          >
            <ArrowLeft data-icon="inline-start" />
            返回
          </Button>
          <h1 className="text-xl font-semibold">{detail.period}</h1>
          <StatusBadge status={detail.status} />
        </div>
        <div className="flex items-center gap-4">
          {hasFinalScore && (
            <>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">总分</p>
                <p className="text-2xl font-bold text-primary leading-8">
                  {detail.totalScore}
                </p>
              </div>
              {detail.grade && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">等级</p>
                  <Badge
                    className={`text-lg font-bold ${getGradeStyle(detail.grade, gradeStyleMap)}`}
                  >
                    {detail.grade}
                  </Badge>
                </div>
              )}
              {detail.coefficient && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">系数</p>
                  <p className="text-xl font-bold text-primary leading-8">
                    {detail.coefficient}
                  </p>
                </div>
              )}
            </>
          )}
          {showPreview && (
            <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-1.5">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">预估</p>
                <p className="text-xl font-bold text-muted-foreground">
                  {previewScore}
                </p>
              </div>
              {previewGrade && (
                <Badge
                  className={`text-sm font-bold ${getGradeStyle(previewGrade, gradeStyleMap)}`}
                >
                  {previewGrade}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Process stepper card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserDisplay
              value={{ user_id: detail.employeeId, name: detail.employeeName }}
              size="small"
              showLabel
            />
            <span className="text-muted-foreground font-normal text-sm">
              【{detail.position}】的绩效评分
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-stretch justify-between gap-3">
            {[
              {
                key: 'self',
                label: '本人评分+签名',
                done: !!detail.selfSignName && detail.status !== 'self_review',
                active:
                  detail.status === 'self_review' ||
                  detail.status === 'pending_sign',
                statusText: detail.selfSignName
                  ? '已完成'
                  : detail.status === 'self_review' ||
                      detail.status === 'pending_sign'
                    ? '进行中'
                    : '待进行',
                operatorId: detail.employeeId,
                score: selfScore,
                signImage: detail.selfSignImage || null,
              },
              {
                key: 'supervisor',
                label: '上级评分+签名',
                done:
                  detail.status === 'completed' && !!detail.supervisorSignName,
                active:
                  detail.status === 'supervisor_review' ||
                  detail.status === 'supervisor_sign',
                statusText:
                  detail.status === 'completed' && detail.supervisorSignName
                    ? '已完成'
                    : detail.status === 'supervisor_review' ||
                        detail.status === 'supervisor_sign'
                      ? '进行中'
                      : '待进行',
                operatorId: detail.supervisorId,
                score: supervisorScore,
                signImage: detail.supervisorSignImage || null,
              },
            ].map((step, i) => {
	              const stepTone = step.done
	                ? {
	                    panel: 'border-success/20 bg-success/[0.03]',
	                    badge:
	                      'bg-success/10 text-success border-success/20',
	                    variant: 'default' as const,
	                  }
	                : step.active
	                  ? {
	                      panel:
	                        'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/15',
	                      badge:
	                        'bg-primary/10 text-primary border-primary/20',
	                      variant: 'secondary' as const,
                    }
                  : {
                      panel: 'border-border bg-muted/20',
                      badge:
                        'bg-muted text-muted-foreground border-border',
                      variant: 'outline' as const,
                    };

              return (
	              <div key={step.key} className="flex flex-1 items-center min-w-0">
	                <div
			                  className={`flex h-full w-full min-w-0 flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-center lg:gap-6 ${stepTone.panel}`}
	                >
		                  <div className="flex min-w-[190px] flex-col">
                    <div className="flex h-8 items-center justify-start overflow-hidden">
                      <span className="truncate text-xs font-medium">
                        {step.label}
                      </span>
                    </div>
                    <div className="flex h-8 items-center justify-start gap-2">
                      {step.operatorId ? (
                        <UserDisplay
                          userId={step.operatorId}
                          size="small"
                          showLabel
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
	                      )}
	                      <Badge
	                        variant={stepTone.variant}
	                        className={`text-[0.625rem] px-1.5 py-0 shrink-0 ${stepTone.badge}`}
	                      >
                        {step.statusText}
                      </Badge>
                    </div>
                  </div>
		                  <div className="flex h-16 w-full min-w-[260px] flex-1 items-center gap-4 overflow-hidden rounded-md border border-border/70 bg-background px-4">
		                    <div className="flex w-20 shrink-0 items-center justify-center">
	                      {step.score != null ? (
	                        <span className="text-base font-semibold tabular-nums">
	                          {step.score}分
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {step.active ? '进行中' : '待进行'}
	                        </span>
	                      )}
	                    </div>
		                    <div className="h-8 w-px shrink-0 bg-border/70" />
		                    <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
	                      {step.signImage ? (
	                        <img
	                          src={step.signImage}
	                          alt={`${step.label}签名`}
	                          className="max-h-14 w-full object-contain"
	                        />
	                      ) : (
                        <span className="text-xs text-muted-foreground">
                          未签名
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {i < 1 && (
                  <ChevronRight
                    className={`size-4 shrink-0 -ml-1 -mr-1 ${
                      step.done ? 'text-success' : 'text-muted-foreground/30'
                    }`}
                  />
                )}
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Indicator tables */}
      <IndicatorTable
        groups={groupedIndicators}
        ratings={ratings}
        canEditSelf={canEditSelf}
        canEditSupervisor={canEditSupervisor}
        updateRating={updateRating}
      />

	      {/* Actions */}
	      {(canEditSelf || canEditSupervisor || isCompleted) && (
	        <div className="sticky bottom-0 z-20 -mx-2 border-t bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
	          <div className="flex flex-wrap items-center justify-center gap-3">
	            {canEditSelf && (
	              <>
	                <Button
	                  variant="outline"
	                  onClick={() => void handleSaveDraft()}
	                  disabled={submitting}
	                >
	                  <Save data-icon="inline-start" />
	                  保存草稿
	                </Button>
	                <Button onClick={handleSubmitClick} disabled={submitting}>
	                  <Send data-icon="inline-start" />
	                  提交自评
	                </Button>
	              </>
	            )}
	            {canEditSupervisor && (
	              <>
	                <Button
	                  variant="outline"
	                  onClick={() => void handleSaveDraft()}
	                  disabled={submitting}
	                >
	                  <Save data-icon="inline-start" />
	                  保存草稿
	                </Button>
	                <Button onClick={handleSubmitClick} disabled={submitting}>
	                  <Send data-icon="inline-start" />
	                  提交评分
	                </Button>
	              </>
	            )}
	            {isCompleted && (
	              <p className="text-muted-foreground text-sm">
	                绩效已完成，档案只读
	              </p>
	            )}
	          </div>
	        </div>
	      )}

      <SignDialog
        open={signDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            void handleCancelSign();
          } else {
            setSignDialogOpen(open);
          }
        }}
        signType={signType}
        signImage={signImage}
        setSignImage={setSignImage}
        loading={submitting}
        onConfirm={handleSign}
        onCancel={handleCancelSign}
      />

      <AlertDialog
        open={scoreWarningDialogOpen}
        onOpenChange={setScoreWarningDialogOpen}
      >
        <AlertDialogContent className="w-[95vw] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>确认提交评分</AlertDialogTitle>
            <AlertDialogDescription>
              以下 {scoreWarningIndicators.length}{' '}
              项指标评分超过1.2系数，请确认是否继续提交。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm">
            {scoreWarningIndicators.slice(0, 8).map((name, index) => (
              <div key={`${name}-${index}`} className="py-0.5">
                {name}
              </div>
            ))}
            {scoreWarningIndicators.length > 8 && (
              <div className="py-0.5 text-muted-foreground">
                另有 {scoreWarningIndicators.length - 8} 项
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmScoreWarningSubmit}
              disabled={submitting}
            >
              确认提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AssessmentDetailPage;

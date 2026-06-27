import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Send,
  PenLine,
  User,
  Users2,
  PenTool,
  CheckCircle2,
  Circle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/business-ui/status-badge';
import { UserDisplay } from '@/components/business-ui/user-display';
import * as assessmentOperation from '@client/src/api/assessment-operation';
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
    groupedIndicators,
    canEditSelf,
    canEditSupervisor,
    canSignSelf,
    canSignSupervisor,
    isCompleted,
    previewScore,
    previewGrade,
    gradeStyleMap,
    fetchDetail,
    updateRating,
    handleSaveDraft,
    handleSubmit,
  } = useAssessmentDetail(id, isSupervisorView, currentUserId);

  const [signDialogOpen, setSignDialogOpen] = useState<boolean>(false);
  const [signType, setSignType] = useState<'self' | 'supervisor'>('self');
  const [signImage, setSignImage] = useState<string | null>(null);
  const [signing, setSigning] = useState<boolean>(false);

  const handleOpenSignDialog = (type: 'self' | 'supervisor') => {
    setSignType(type);
    setSignImage(null);
    setSignDialogOpen(true);
  };

  const handleSign = async () => {
    if (!id || !signImage) return;
    setSigning(true);
    try {
      const result = await assessmentOperation.sign(id, {
        signType,
        signName:
          signType === 'self'
            ? detail?.employeeName || ''
            : detail?.supervisorName || '',
        signImage: signImage ?? undefined,
      });
      toast.success(
        result.status === 'completed' ? '双方已签名，绩效完成' : '签名成功',
      );
      setSignDialogOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '签名失败';
      logger.error('Sign failed:', msg);
      toast.error(msg);
    } finally {
      setSigning(false);
    }
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
            <ArrowLeft className="size-4" />
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
                <p className="text-2xl font-bold text-primary">
                  {detail.totalScore}
                </p>
              </div>
              {detail.grade && (
                <span
                  className={`px-3 py-1 rounded-md text-lg font-bold ${getGradeStyle(detail.grade, gradeStyleMap)}`}
                >
                  {detail.grade}
                </span>
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
                <span
                  className={`px-2 py-0.5 rounded text-sm font-bold ${getGradeStyle(previewGrade, gradeStyleMap)}`}
                >
                  {previewGrade}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Process stepper card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserDisplay userId={detail.employeeId} size="small" showLabel />
            <span className="text-muted-foreground font-normal text-sm">
              【{detail.position}】的绩效评分
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 4-step progress bar */}
          <div className="flex items-start justify-between gap-1">
            {[
              {
                key: 'self',
                label: '员工自评',
                icon: User,
                done: detail.status !== 'self_review',
                active: detail.status === 'self_review',
                person: detail.employeeId,
              },
              {
                key: 'supervisor',
                label: '上级评分',
                icon: Users2,
                done:
                  detail.status === 'pending_sign' ||
                  detail.status === 'completed',
                active: detail.status === 'supervisor_review',
                person: detail.supervisorId,
              },
              {
                key: 'selfSign',
                label: '员工签名',
                icon: PenTool,
                done: !!detail.selfSignName,
                active:
                  detail.status === 'pending_sign' && !detail.selfSignName,
                person: null,
              },
              {
                key: 'supSign',
                label: '上级签名',
                icon: PenTool,
                done:
                  !!detail.supervisorSignName || detail.status === 'completed',
                active:
                  detail.status === 'pending_sign' &&
                  !!detail.selfSignName &&
                  !detail.supervisorSignName,
                person: null,
              },
            ].map((step, i) => (
              <div key={step.key} className="flex-1 flex items-start min-w-0">
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${
                      step.done
                        ? 'bg-success text-success-foreground'
                        : step.active
                          ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="size-5" />
                    ) : step.active ? (
                      <step.icon className="size-4" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                  </div>
                  <p
                    className={`text-xs text-center leading-tight ${
                      step.active
                        ? 'text-primary font-semibold'
                        : step.done
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </p>
                  <span
                    className={`text-[0.625rem] ${
                      step.done
                        ? 'text-success'
                        : step.active
                          ? 'text-primary'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.done ? '已完成' : step.active ? '进行中' : '待进行'}
                  </span>
                  {step.person && (
                    <div className="mt-1">
                      <UserDisplay
                        userId={step.person}
                        size="small"
                        showLabel
                      />
                    </div>
                  )}
                </div>
                {i < 3 && (
                  <ChevronRight
                    className={`size-4 shrink-0 -ml-1 -mr-1 mt-3 ${
                      step.done ? 'text-success' : 'text-muted-foreground/30'
                    }`}
                  />
                )}
              </div>
            ))}
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
      <div className="flex flex-wrap items-center justify-center gap-3 pb-4">
        {canEditSelf && (
          <>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={submitting}
            >
              <Save className="size-4 mr-2" />
              保存草稿
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="size-4 mr-2" />
              提交自评
            </Button>
          </>
        )}
        {canEditSupervisor && (
          <>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={submitting}
            >
              <Save className="size-4 mr-2" />
              保存草稿
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="size-4 mr-2" />
              提交评分
            </Button>
          </>
        )}
        {canSignSelf && (
          <Button
            onClick={() => handleOpenSignDialog('self')}
            disabled={submitting}
          >
            <PenLine className="size-4 mr-2" />
            员工签名
          </Button>
        )}
        {canSignSupervisor && (
          <Button
            onClick={() => handleOpenSignDialog('supervisor')}
            disabled={submitting}
          >
            <PenLine className="size-4 mr-2" />
            上级签名
          </Button>
        )}
        {isCompleted && (
          <p className="text-muted-foreground text-sm">绩效已完成，档案只读</p>
        )}
      </div>

      <SignDialog
        open={signDialogOpen}
        onOpenChange={setSignDialogOpen}
        signType={signType}
        signImage={signImage}
        setSignImage={setSignImage}
        loading={signing}
        onConfirm={handleSign}
      />
    </div>
  );
};

export default AssessmentDetailPage;

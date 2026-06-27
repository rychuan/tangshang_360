import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, PenLine, User, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: info + actions */}
        <div className="flex flex-col gap-4">
          {/* Status overview card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">绩效状态</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {/* Self */}
              <div className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium">我</p>
                    <Badge
                      className={
                        detail.selfSignName
                          ? 'bg-success/10 text-success border-transparent text-xs'
                          : detail.status === 'self_review'
                            ? 'bg-info/10 text-info border-transparent text-xs'
                            : 'bg-warning/10 text-warning border-transparent text-xs'
                      }
                    >
                      {detail.selfSignName
                        ? '已签名'
                        : detail.status === 'self_review'
                          ? '待自评'
                          : '待签名'}
                    </Badge>
                  </div>
                  {detail.selfSignImage ? (
                    <img
                      src={detail.selfSignImage}
                      alt="本人签名"
                      className="h-14 border rounded-md object-contain bg-muted/30"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {detail.status === 'self_review'
                        ? '请完成自评后签名'
                        : '请完成签名'}
                    </p>
                  )}
                </div>
              </div>

              {/* Supervisor */}
              <div className="border-t pt-4 flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                  <Users2 className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">上级</p>
                      {detail.supervisorId ? (
                        <UserDisplay
                          userId={detail.supervisorId}
                          size="small"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                    <Badge
                      className={
                        detail.supervisorSignName
                          ? 'bg-success/10 text-success border-transparent text-xs shrink-0 ml-2'
                          : detail.status === 'supervisor_review'
                            ? 'bg-info/10 text-info border-transparent text-xs shrink-0 ml-2'
                            : 'bg-warning/10 text-warning border-transparent text-xs shrink-0 ml-2'
                      }
                    >
                      {detail.supervisorSignName
                        ? '已签名'
                        : detail.status === 'supervisor_review'
                          ? '待评分'
                          : detail.status === 'completed'
                            ? '已签名'
                            : '待签名'}
                    </Badge>
                  </div>
                  {detail.supervisorSignImage ? (
                    <img
                      src={detail.supervisorSignImage}
                      alt="上级签名"
                      className="h-14 border rounded-md object-contain bg-muted/30"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {detail.status === 'supervisor_review'
                        ? '请完成上级评分后签名'
                        : detail.status === 'completed'
                          ? ''
                          : '请完成签名'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {canEditSelf && (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={submitting}
                  className="w-full"
                >
                  <Save className="size-4 mr-2" />
                  保存草稿
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full"
                >
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
                  className="w-full"
                >
                  <Save className="size-4 mr-2" />
                  保存草稿
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full"
                >
                  <Send className="size-4 mr-2" />
                  提交评分
                </Button>
              </>
            )}
            {canSignSelf && (
              <Button
                onClick={() => handleOpenSignDialog('self')}
                disabled={submitting}
                className="w-full"
              >
                <PenLine className="size-4 mr-2" />
                本人签名
              </Button>
            )}
            {canSignSupervisor && (
              <Button
                onClick={() => handleOpenSignDialog('supervisor')}
                disabled={submitting}
                className="w-full"
              >
                <PenLine className="size-4 mr-2" />
                上级签名
              </Button>
            )}
            {isCompleted && (
              <p className="text-muted-foreground text-sm text-center py-2">
                绩效已完成，档案只读
              </p>
            )}
          </div>
        </div>

        {/* Right column: indicator scoring */}
        <div className="lg:col-span-3 min-w-0">
          <IndicatorTable
            groups={groupedIndicators}
            ratings={ratings}
            canEditSelf={canEditSelf}
            canEditSupervisor={canEditSupervisor}
            updateRating={updateRating}
          />
        </div>
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

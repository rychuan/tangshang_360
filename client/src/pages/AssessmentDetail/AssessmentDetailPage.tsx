import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import * as assessmentOperation from '@client/src/api/assessment-operation';
import { useAssessmentDetail } from './useAssessmentDetail';
import AssessmentHeaderCard from './AssessmentHeaderCard';
import IndicatorTable from './IndicatorTable';
import SignDialog from './SignDialog';

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
        result.status === 'completed' ? '双方已签名，考核完成' : '签名成功',
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
        <p className="text-muted-foreground">{error || '考核记录不存在'}</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="gap-2 -ml-3"
      >
        <ArrowLeft className="size-4" />
        返回
      </Button>

      <AssessmentHeaderCard
        detail={detail}
        previewScore={previewScore}
        previewGrade={previewGrade}
      />

      <IndicatorTable
        groups={groupedIndicators}
        ratings={ratings}
        canEditSelf={canEditSelf}
        canEditSupervisor={canEditSupervisor}
        updateRating={updateRating}
      />

      <div className="flex flex-wrap items-center justify-end gap-3 pb-8">
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
            本人签名
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
          <p className="text-muted-foreground text-sm">考核已完成，档案只读</p>
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

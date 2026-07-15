import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import SignaturePad from '@/components/SignaturePad';
import * as signTokenApi from '@client/src/api/sign-token';
import { handleApiError } from '@client/src/utils/api-error';
import { getAppBaseUrl } from '@client/src/utils/app-url';

interface SignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signType: 'self' | 'supervisor';
  signImage: string | null;
  setSignImage: (image: string | null) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  instanceId?: string;
  onMobileSignComplete?: () => void;
  onSubmitRatings?: () => Promise<void>;
}

const SignDialog: React.FC<SignDialogProps> = ({
  open,
  onOpenChange,
  signType,
  signImage,
  setSignImage,
  loading,
  onConfirm,
  onCancel,
  instanceId,
  onMobileSignComplete,
  onSubmitRatings,
}) => {
  const [mobileSent, setMobileSent] = useState(false);
  const [mobileSending, setMobileSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);

  const clearPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open) {
      setMobileSent(false);
      setMobileSending(false);
    } else {
      clearPolling();
    }
  }, [open, clearPolling]);

  useEffect(() => {
    return clearPolling;
  }, [clearPolling]);

  const startPolling = (token: string) => {
    clearPolling();
    const generation = pollGenerationRef.current;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const res = await signTokenApi.checkSignStatus(token);
        if (pollGenerationRef.current !== generation) return;
        if (res.status === 'succeeded') {
          pollRef.current = null;
          toast.success('手机签名已完成');
          setSignImage(null);
          onMobileSignComplete?.();
          return;
        }
        if (res.status !== 'pending') {
          pollRef.current = null;
          setMobileSent(false);
          const message =
            res.status === 'expired'
              ? '签名链接已过期，请重新发起'
              : res.status === 'forbidden'
                ? '当前账号无权使用该签名链接'
                : '签名会话已失效，请重新发起';
          toast.warning(message);
          return;
        }
        if (Date.now() - startedAt > 2 * 60 * 1000) {
          pollRef.current = null;
          toast.warning('签名等待超时，请重新发起');
          setMobileSent(false);
          return;
        }
      } catch {
        // 轮询失败静默重试
      }
      if (pollGenerationRef.current === generation) {
        pollRef.current = setTimeout(poll, 2000);
      }
    };
    pollRef.current = setTimeout(poll, 2000);
  };

  const handleSendToPhone = async () => {
    if (!instanceId || mobileSending) return;
    setMobileSending(true);
    try {
      if (onSubmitRatings) {
        await onSubmitRatings();
      }
      const res = await signTokenApi.generateSignToken(
        instanceId,
        signType,
        getAppBaseUrl(),
      );
      setMobileSent(true);
      toast.success('已发送到飞书，请在手机上打开并签名');
      startPolling(res.token);
    } catch (err) {
      logger.error('Generate sign token failed:', err);
      handleApiError(err);
    } finally {
      setMobileSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {signType === 'self' ? '本人签名确认' : '上级签名确认'}
          </DialogTitle>
          <DialogDescription>请在下方区域手写签名</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-4">
          <SignaturePad onChange={setSignImage} disabled={loading} />
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onCancel ?? (() => onOpenChange(false))}
              disabled={loading}
            >
              取消
            </Button>
            <Button onClick={onConfirm} disabled={loading || !signImage}>
              确认签名
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">或者</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
            {mobileSent ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    等待手机签名...
                  </span>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  已发送到您的飞书，请在手机上点击链接完成签名
                </p>
              </div>
            ) : (
              <>
                <Smartphone className="size-8 text-muted-foreground" />
                <p className="text-center text-sm text-muted-foreground">
                  手机全屏签名更方便
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendToPhone}
                  disabled={mobileSending || !instanceId}
                >
                  {mobileSending ? (
                    <>
                      <Loader2 className="size-3.5 mr-1 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    <>
                      <Smartphone className="size-3.5 mr-1" />
                      发送到手机签名
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignDialog;

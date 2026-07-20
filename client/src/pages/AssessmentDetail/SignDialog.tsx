import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Smartphone, Loader2, X } from 'lucide-react';
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

/* ------------------------------------------------------------------ */
/*  Desktop signature pad section (shared by both Dialog and mobile)  */
/* ------------------------------------------------------------------ */

const DesktopSignSection: React.FC<{
  signImage: string | null;
  setSignImage: (v: string | null) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  mobileSent: boolean;
  mobileSending: boolean;
  onSendToPhone: () => void;
  instanceId?: string;
}> = ({
  signImage: _signImage,
  setSignImage,
  loading,
  onConfirm,
  onCancel,
  mobileSent,
  mobileSending,
  onSendToPhone,
  instanceId,
}) => (
  <div className="flex flex-col gap-4 pt-4">
    <SignaturePad onChange={setSignImage} disabled={loading} />
    <div className="flex justify-end gap-3">
      <Button variant="outline" onClick={onCancel} disabled={loading}>
        取消
      </Button>
      <Button onClick={onConfirm} disabled={loading || !_signImage}>
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
            onClick={onSendToPhone}
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
);

/* ------------------------------------------------------------------ */
/*  Mobile full-screen landscape signature overlay                    */
/* ------------------------------------------------------------------ */

const MobileSignOverlay: React.FC<{
  signType: 'self' | 'supervisor';
  signImage: string | null;
  setSignImage: (v: string | null) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  mobileSent: boolean;
  mobileSending: boolean;
  onSendToPhone: () => void;
  instanceId?: string;
}> = ({
  signType,
  signImage: _signImage,
  setSignImage,
  loading,
  onConfirm,
  onCancel,
  mobileSent,
  mobileSending,
  onSendToPhone,
  instanceId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [landscape, setLandscape] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false
  );

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  /* ---- canvas helpers ---- */
  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (hasDrawnRef.current) {
      hasDrawnRef.current = false;
      setIsEmpty(true);
      setSignImage(null);
    }
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
  }, [getCtx, setSignImage]);

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    resizeCanvas();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(resizeCanvas, 250);
    };
    window.addEventListener('orientationchange', schedule);
    window.screen.orientation?.addEventListener('change', schedule);
    // Try to lock landscape
    try {
      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
    } catch {}
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('orientationchange', schedule);
      window.screen.orientation?.removeEventListener('change', schedule);
    };
  }, [resizeCanvas]);

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  /* ---- pointer handlers ---- */
  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (loading) return;
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = getPoint(e);
    },
    [loading, getPoint],
  );

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || loading) return;
      e.preventDefault();
      const ctx = getCtx();
      if (!ctx || !lastPointRef.current) return;
      const cur = getPoint(e);
      const last = lastPointRef.current;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      lastPointRef.current = cur;
      if (!hasDrawnRef.current) {
        hasDrawnRef.current = true;
        setIsEmpty(false);
      }
    },
    [loading, getPoint, getCtx],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      drawingRef.current = false;
      lastPointRef.current = null;
      const canvas = canvasRef.current;
      if (canvas && hasDrawnRef.current) {
        setSignImage(canvas.toDataURL('image/png'));
      }
    },
    [setSignImage],
  );

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setIsEmpty(true);
    setSignImage(null);
  }, [getCtx, setSignImage]);

  const title =
    signType === 'self' ? '本人签名确认' : '上级签名确认';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
    >
      {/* Header: full bar in portrait, compact floating in landscape */}
      <header
        className={'flex shrink-0 items-center justify-between border-b bg-white px-3 ' +
          (landscape
            ? 'absolute left-1.5 top-1.5 z-20 h-8 max-w-[45vw] rounded-md border bg-white/95 px-1.5 shadow-sm'
            : 'h-11')}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="shrink-0 text-muted-foreground"
            onClick={onCancel}
            title="关闭"
          >
            <X className={landscape ? 'size-4' : 'size-5'} />
          </button>
          <span className={'truncate font-medium ' + (landscape ? 'text-[11px]' : 'text-sm')}>
            {title}
          </span>
        </div>
        {!landscape && (
          <span className="truncate text-xs text-muted-foreground">
            {signType === 'self' ? '自评签名' : '上级签名'}
          </span>
        )}
      </header>

      {/* Rotate hint — subtle, portrait only */}
      {!landscape && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          <span>📱 ↺</span>
          <span>旋转手机至横屏，签名区域更大</span>
        </div>
      )}

      {/* Signature pad */}
      <div className={'relative flex min-h-0 flex-1 ' + (landscape ? 'p-1' : 'p-3')}>
        <div className="relative flex min-h-0 flex-1 rounded-lg border-2 border-dashed border-input bg-white">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 size-full touch-none"
            style={{ touchAction: 'none' }}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
          />
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <span className={landscape ? 'text-sm' : 'text-base'}>
                请在此区域手写签名
              </span>
              <span className={'border-t border-muted-foreground/30 pt-2 ' + (landscape ? 'pt-1 text-[10px]' : 'text-xs')}>
                使用手指在屏幕上书写
              </span>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={isEmpty || loading}
            className={'absolute z-10 bg-white/95 shadow-sm ' + (landscape ? 'right-1.5 top-1.5 size-7 p-0' : 'right-2 top-2')}
            title="清空签名"
          >
            {landscape ? <span className="text-xs">✕</span> : <span className="text-xs">清空</span>}
          </Button>
        </div>
      </div>

      {/* Footer: full bar in portrait, floating in landscape */}
      <footer
        className={
          'shrink-0 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ' +
          (landscape ? 'absolute bottom-2 right-2 z-20 border-0 p-0' : '')
        }
      >
        <div className="flex items-center justify-between gap-3">
          {/* Send-to-phone — portrait only */}
          {!landscape && (
            <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/30 p-2">
              {mobileSent ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span className="text-xs font-medium text-primary">
                    等待手机签名...
                  </span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSendToPhone}
                  disabled={mobileSending || !instanceId}
                  className="h-8 text-xs px-2.5"
                >
                  {mobileSending ? (
                    <>
                      <Loader2 className="size-3 mr-1 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    <>
                      <Smartphone className="size-3 mr-1" />
                      发送到手机签名
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
          <div className="ml-auto flex gap-3 landscape:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={loading}
              className="landscape:h-8 landscape:text-xs landscape:px-3"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={loading || !_signImage}
              className="landscape:h-8 landscape:text-xs landscape:px-3 landscape:shadow-lg"
            >
              确认签名
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main SignDialog — switches between desktop Dialog / mobile overlay */
/* ------------------------------------------------------------------ */

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
  const [isMobile, setIsMobile] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);

  /* ---- media query ---- */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  /* ---- polling ---- */
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

  const handleCancel = onCancel ?? (() => onOpenChange(false));

  /* ---- render ---- */
  return (
    <>
      {/* Desktop: standard centred Dialog */}
      {!isMobile && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {signType === 'self' ? '本人签名确认' : '上级签名确认'}
              </DialogTitle>
              <DialogDescription>请在下方区域手写签名</DialogDescription>
            </DialogHeader>
            <DesktopSignSection
              signImage={signImage}
              setSignImage={setSignImage}
              loading={loading}
              onConfirm={onConfirm}
              onCancel={handleCancel}
              mobileSent={mobileSent}
              mobileSending={mobileSending}
              onSendToPhone={handleSendToPhone}
              instanceId={instanceId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile: full-screen landscape overlay */}
      {isMobile && open && (
        <MobileSignOverlay
          signType={signType}
          signImage={signImage}
          setSignImage={setSignImage}
          loading={loading}
          onConfirm={onConfirm}
          onCancel={handleCancel}
          mobileSent={mobileSent}
          mobileSending={mobileSending}
          onSendToPhone={handleSendToPhone}
          instanceId={instanceId}
        />
      )}
    </>
  );
};

export default SignDialog;

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Eraser, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as signTokenApi from '@client/src/api/sign-token';
import { handleApiError } from '@client/src/utils/api-error';

interface MobileSignPadProps {
  onChange: (base64: string | null) => void;
}

const MobileSignPad: React.FC<MobileSignPadProps> = ({ onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef<boolean>(false);
  const [isEmpty, setIsEmpty] = useState<boolean>(true);

  const getCtx = useCallback((): CanvasRenderingContext2D | null => {
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
      onChange(null);
    }
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
  }, [getCtx, onChange]);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 250);
    };

    resizeCanvas();
    window.addEventListener('orientationchange', scheduleResize);
    window.screen.orientation?.addEventListener('change', scheduleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('orientationchange', scheduleResize);
      window.screen.orientation?.removeEventListener('change', scheduleResize);
    };
  }, [resizeCanvas]);

  const getPoint = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !lastPointRef.current) return;
    const current = getPoint(e);
    const last = lastPointRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPointRef.current = current;
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setIsEmpty(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasDrawnRef.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div className="relative min-h-0 flex-1 p-2 landscape:p-1">
      <div className="relative h-full min-h-0 rounded-lg border-2 border-dashed border-input bg-white">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="text-base">请在此区域手写签名</span>
            <span className="border-t border-muted-foreground/30 pt-2 text-xs">
              使用手指在屏幕上书写
            </span>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty}
          className="absolute right-2 top-2 z-10 bg-white/95 shadow-sm landscape:right-1.5 landscape:top-1.5 landscape:size-7 landscape:p-0"
          title="清空签名"
        >
          <Eraser className="size-4 mr-1 landscape:size-3.5 landscape:mr-0" />
          <span className="landscape:hidden">清空</span>
        </Button>
      </div>
    </div>
  );
};

const MobileSignPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [signImage, setSignImage] = useState<string | null>(null);
  const [session, setSession] = useState<{
    employeeName: string;
    period: string;
    signType: 'self' | 'supervisor';
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSubmitting(false);
    setError(null);
    setDone(false);
    setSession(null);
    setSignImage(null);

    if (!token) {
      setError('链接不合法，缺少签名凭证');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    signTokenApi
      .getSignSession(token)
      .then((data) => {
        if (cancelled) return;
        if (data.status === 'succeeded') {
          setDone(true);
        } else if (data.status === 'pending' && data.instanceId) {
          setSession({
            employeeName: data.employeeName,
            period: data.period,
            signType: data.signType,
          });
        } else if (data.status === 'forbidden') {
          setError('此签名链接不属于您的账号，请使用接收签名请求的飞书账号打开');
        } else if (data.status === 'expired') {
          setError('签名链接已过期，请重新发起');
        } else {
          setError('签名链接已失效或不合法，请重新发起');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('Failed to get sign session:', err);
        setError('签名链接验证失败，请重新发起');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async () => {
    if (!signImage || !token || submitting) return;
    setSubmitting(true);
    try {
      const result = await signTokenApi.submitSignByToken({
        token,
        signImage,
      });
      if (result.success || result.status === 'succeeded') {
        setDone(true);
      } else if (result.status === 'forbidden') {
        setError('此签名链接不属于您的账号，请使用发送签名请求的飞书账号打开');
      } else if (result.status === 'expired') {
        setError('签名链接已过期，请重新发起');
      } else if (result.status === 'failed' || result.status === 'invalid') {
        setError('签名会话已失效，请重新发起');
      } else {
        setError('签名提交失败，请重试');
      }
    } catch (err) {
      logger.error('Sign by token failed:', err);
      handleApiError(err);
      setError('签名提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white p-8">
        <p className="text-center text-base text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.close()}>
          关闭
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white p-8">
        <CheckCircle className="size-16 text-success" />
        <p className="text-center text-lg font-medium text-success">签名成功</p>
        <p className="text-center text-sm text-muted-foreground">
          您可以关闭此页面
        </p>
        <Button variant="outline" onClick={() => window.close()}>
          关闭
        </Button>
      </div>
    );
  }

  const signTypeLabel =
    session?.signType === 'self' ? '本人签名' : '上级签名';

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-white px-4 landscape:absolute landscape:left-1.5 landscape:top-1.5 landscape:z-20 landscape:h-7 landscape:max-w-[45vw] landscape:justify-start landscape:rounded-md landscape:border landscape:bg-white/95 landscape:px-1.5 landscape:shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="shrink-0 text-muted-foreground"
            onClick={() => window.close()}
            title="关闭"
          >
            <X className="size-5 landscape:size-4" />
          </button>
          <span className="truncate text-sm font-medium landscape:text-[11px]">
            {signTypeLabel}
          </span>
        </div>
        <span className="truncate text-xs text-muted-foreground landscape:hidden">
          {session?.employeeName} · {session?.period}
        </span>
      </header>

      <MobileSignPad onChange={setSignImage} />

      <footer className="shrink-0 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] landscape:absolute landscape:bottom-2 landscape:right-2 landscape:z-20 landscape:border-0 landscape:p-0">
        <Button
          className="h-12 w-full text-base shadow-sm landscape:h-8 landscape:w-24 landscape:text-xs landscape:shadow-lg"
          disabled={!signImage || submitting}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : '确认签名'}
        </Button>
      </footer>
    </div>
  );
};

export default MobileSignPage;

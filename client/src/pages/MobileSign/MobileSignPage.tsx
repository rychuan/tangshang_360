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
  }, [getCtx]);

  useEffect(() => {
    resizeCanvas();
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    <div className="relative flex flex-1 flex-col">
      <div className="relative flex-1 rounded-lg border-2 border-dashed border-input bg-white">
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
      </div>
      <div className="flex justify-end px-4 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty}
        >
          <Eraser className="size-4 mr-1" />
          清空
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
    if (!token) {
      setError('链接不合法，缺少签名凭证');
      setLoading(false);
      return;
    }
    signTokenApi
      .getSignSession(token)
      .then((data) => {
        if (!data.instanceId) {
          setError('签名链接已过期或不合法，请重新发起');
        } else {
          setSession({
            employeeName: data.employeeName,
            period: data.period,
            signType: data.signType,
          });
        }
      })
      .catch((err) => {
        logger.error('Failed to get sign session:', err);
        setError('签名链接验证失败，请重新发起');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!signImage || !token || submitting) return;
    setSubmitting(true);
    try {
      const result = await signTokenApi.submitSignByToken({
        token,
        signName: session?.employeeName || '',
        signImage,
      });
      if (result.success) {
        setDone(true);
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
      <div className="flex h-svh items-center justify-center bg-white">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-4 bg-white p-8">
        <p className="text-center text-base text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.close()}>
          关闭
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-4 bg-white p-8">
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
    <div className="flex h-svh flex-col bg-white">
      <header className="flex h-12 items-center justify-between border-b px-4 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-muted-foreground"
            onClick={() => window.close()}
          >
            <X className="size-5" />
          </button>
          <span className="text-sm font-medium">
            {signTypeLabel}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {session?.employeeName} · {session?.period}
        </span>
      </header>

      <MobileSignPad onChange={setSignImage} />

      <footer className="shrink-0 border-t px-4 py-3">
        <Button
          className="h-12 w-full text-base"
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

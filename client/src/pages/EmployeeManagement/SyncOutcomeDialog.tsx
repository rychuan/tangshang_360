import React, { useState, useCallback } from 'react';
import type { RoleMemberMutationOutcome } from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { RefreshCw, AlertTriangle, CheckCircle2 } from '@/components/ui/hugeicons';
import { retryFailedOutcome } from './role-sync-outcomes';

interface SyncOutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 同步失败的 outcome 列表（failed/not_processable） */
  outcomes: RoleMemberMutationOutcome[];
  title?: string;
  /** 全部失败成员重试成功（或全部处理完毕）后回调，用于刷新成员列表 */
  onAllResolved?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  failed: '同步失败',
  not_processable: '无同步任务',
  superseded: '已被新变更覆盖',
  stale_owner: '由其他任务处理中',
};

const SyncOutcomeDialog: React.FC<SyncOutcomeDialogProps> = ({
  open,
  onOpenChange,
  outcomes,
  title = '部分成员授权同步失败',
  onAllResolved,
}) => {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  // 打开时重置状态
  const reset = useCallback(() => {
    setPending(new Set());
    setResolved(new Set());
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const retryOne = useCallback(
    async (outcome: RoleMemberMutationOutcome) => {
      if (pending.has(outcome.userId)) return;
      setPending((prev) => new Set(prev).add(outcome.userId));
      const result = await retryFailedOutcome(outcome);
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(outcome.userId);
        return next;
      });
      if (result.ok) {
        setResolved((prev) => new Set(prev).add(outcome.userId));
        toast.success(`成员 ${outcome.userId} 授权同步成功`);
      } else {
        toast.error(
          `成员 ${outcome.userId} 重试失败：${result.error || '未知错误'}`,
        );
      }
    },
    [pending],
  );

  const retryAll = useCallback(async () => {
    for (const outcome of outcomes) {
      await retryOne(outcome);
    }
  }, [outcomes, retryOne]);

  const failed = outcomes.filter((o) => !resolved.has(o.userId));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>
            以下成员的期望角色已写入，但同步到权限平台失败。可在下方逐人重试，或稍后在角色成员管理中重试。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] space-y-2 overflow-auto rounded-lg border p-2">
          {failed.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" />
              全部成员已同步成功
            </div>
          ) : (
            failed.map((outcome) => {
              const isPending = pending.has(outcome.userId);
              const isResolved = resolved.has(outcome.userId);
              return (
                <div
                  key={outcome.userId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {outcome.userId}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs font-normal">
                        {STATUS_LABEL[outcome.status] || outcome.status}
                      </Badge>
                      {outcome.error ? (
                        <span className="truncate">{outcome.error}</span>
                      ) : null}
                    </div>
                  </div>
                  {isResolved ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => retryOne(outcome)}
                    >
                      {isPending ? (
                        <Spinner className="mr-1 size-3.5" />
                      ) : (
                        <RefreshCw className="mr-1 size-3.5" />
                      )}
                      重试
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {failed.length > 0
              ? `剩余 ${failed.length} 个成员待同步`
              : '同步完成'}
          </span>
          <div className="flex gap-2">
            {failed.length > 0 && (
              <Button
                variant="outline"
                onClick={retryAll}
                disabled={pending.size > 0}
              >
                <RefreshCw className="mr-1 size-4" /> 全部重试
              </Button>
            )}
            <Button
              variant={failed.length > 0 ? 'default' : 'outline'}
              onClick={() => {
                const hadFailures = outcomes.some(
                  (o) => !resolved.has(o.userId),
                );
                reset();
                onOpenChange(false);
                if (!hadFailures) onAllResolved?.();
              }}
            >
              {failed.length > 0 ? '关闭' : '完成'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncOutcomeDialog;

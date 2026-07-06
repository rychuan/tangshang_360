import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@/utils/api-error';
import { getUnlockHistory } from '@/api/assessment-publish';
import { PUBLISHED_STATUS_LABELS } from './published-assessment-columns';
import { Clock } from 'lucide-react';
import dayjs from 'dayjs';
import type { UnlockHistoryItem } from '@shared/api.interface';

interface UnlockHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string | null;
}

const UnlockHistoryDialog: React.FC<UnlockHistoryDialogProps> = ({
  open,
  onOpenChange,
  instanceId,
}) => {
  const [history, setHistory] = useState<UnlockHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !instanceId) return;
    let cancelled = false;
    setLoading(true);
    setHistory([]);
    getUnlockHistory(instanceId)
      .then((data: UnlockHistoryItem[]) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('getUnlockHistory failed', err);
          handleApiError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, instanceId]);

  const formatStatus = (status: string): string =>
    PUBLISHED_STATUS_LABELS[status] ?? status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>解锁历史记录</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-8">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无解锁记录</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((item: UnlockHistoryItem) => (
                <div
                  key={item.id}
                  className="rounded-md border p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {item.operatorName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    状态变更：{formatStatus(item.fromStatus)} →{' '}
                    {formatStatus(item.toStatus)}
                  </div>
                  <div className="text-sm text-foreground">
                    原因：{item.reason || '未填写'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UnlockHistoryDialog;

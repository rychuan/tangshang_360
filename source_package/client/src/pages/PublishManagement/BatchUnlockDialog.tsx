import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BatchUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

const BatchUnlockDialog: React.FC<BatchUnlockDialogProps> = ({
  open,
  onOpenChange,
  selectedCount,
  reason,
  onReasonChange,
  onSubmit,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>批量解锁考核</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            已选择 {selectedCount} 项考核，解锁后将回退到上一阶段。
          </p>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">
              解锁原因 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onReasonChange(e.target.value)
              }
              placeholder="请输入解锁原因"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              data-ai-section-type="button"
              onClick={onSubmit}
              disabled={loading || !reason.trim()}
            >
              {loading ? '解锁中...' : '确认解锁'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BatchUnlockDialog;

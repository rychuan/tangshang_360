import React from 'react';
import { toast } from 'sonner';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MultiMonthPicker from '@/components/ui/multi-month-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type {
  BindingHistoryItem,
  AssessmentTemplateItem,
} from '@shared/api.interface';
import { Loader2Icon } from 'lucide-react';

function statusBadge(status: boolean): React.ReactNode {
  if (status) {
    return (
      <Badge className="border-transparent bg-success text-success-foreground">
        已绑定
      </Badge>
    );
  }
  return <Badge variant="secondary">已解绑</Badge>;
}

export interface BindDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bindEmployeeIds: string[];
  setBindEmployeeIds: (v: string[]) => void;
  bindTemplateId: string;
  setBindTemplateId: (v: string) => void;
  bindEffectiveFrom: string[];
  setBindEffectiveFrom: (v: string[]) => void;
  bindSubmitting: boolean;
  onConfirm: () => void;
  templates: AssessmentTemplateItem[];
}

const BindDialog: React.FC<BindDialogProps> = ({
  open,
  onOpenChange,
  bindEmployeeIds,
  setBindEmployeeIds,
  bindTemplateId,
  setBindTemplateId,
  bindEffectiveFrom,
  setBindEffectiveFrom,
  bindSubmitting,
  onConfirm,
  templates,
}) => {
  const handleConfirm = (): void => {
    if (bindEmployeeIds.length === 0) {
      toast.error('请选择员工');
      return;
    }
    if (!bindTemplateId) {
      toast.error('请选择绩效模板');
      return;
    }
    if (!bindEffectiveFrom.length) {
      toast.error('请选择生效月份');
      return;
    }
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>绑定绩效模板</DialogTitle>
          <DialogDescription>
            为员工绑定绩效模板，绑定后原有模板将自动停用
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground mb-1.5">
              选择员工
            </Label>
            <UserSelect
              multiple
              value={bindEmployeeIds}
              onChange={setBindEmployeeIds}
              placeholder="请选择员工"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground mb-1.5">
              绩效模板
            </Label>
            <Select
              value={bindTemplateId}
              onValueChange={(v: string) => setBindTemplateId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择模板" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: AssessmentTemplateItem) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground mb-1.5">
              生效月份
            </Label>
            <MultiMonthPicker
              value={bindEffectiveFrom}
              onChange={setBindEffectiveFrom}
              single
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={bindSubmitting}
          >
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={bindSubmitting}>
            {bindSubmitting && (
              <Loader2Icon className="mr-1 size-4 animate-spin" />
            )}
            确认绑定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export interface UnbindDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}

const UnbindDialog: React.FC<UnbindDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>确认解绑</DialogTitle>
          <DialogDescription>
            解绑后该员工的当前绑定模板将停用，确定要解绑吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            确认解绑
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeName: string;
  historyItems: BindingHistoryItem[];
  loading: boolean;
}

const HistoryDialog: React.FC<HistoryDialogProps> = ({
  open,
  onOpenChange,
  employeeName,
  historyItems,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>绑定历史</DialogTitle>
          <DialogDescription>{employeeName} 的绑定变更记录</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无历史记录
            </p>
          ) : (
            <div className="relative ml-4 border-l border-border pl-6">
              {historyItems.map((item: BindingHistoryItem, idx: number) => (
                <div key={idx} className="relative mb-6 last:mb-0">
                  <span className="absolute -left-[1.625rem] top-1 size-2.5 rounded-full border-2 border-primary bg-background" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {item.templateName}
                    </span>
                    {statusBadge(item.status)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    生效月份: {item.effectiveFrom}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    操作时间:{' '}
                    {item.operatedAt
                      ? new Date(item.operatedAt).toLocaleString('zh-CN')
                      : '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { BindDialog, UnbindDialog, HistoryDialog };

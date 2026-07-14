import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BellRing } from 'lucide-react';
import type { ReminderPreviewResponse } from '@shared/api.interface';

interface UnfinishedReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ReminderPreviewResponse | null;
  period: string;
  department?: string;
  statusLabel: string;
  grade?: string;
  sending: boolean;
  onConfirm: () => void;
}

const UnfinishedReminderDialog: React.FC<UnfinishedReminderDialogProps> = ({
  open,
  onOpenChange,
  preview,
  period,
  department,
  statusLabel,
  grade,
  sending,
  onConfirm,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[95vw] max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <BellRing className="size-5 text-primary" />
            <AlertDialogTitle>通知未完成任务</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            将向当前筛选范围内所有未完成绩效的员工和上级发送针对性飞书消息。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border bg-muted/20 p-4 text-sm">
          <span className="text-muted-foreground">绩效周期</span>
          <span className="text-right font-medium">{period}</span>
          <span className="text-muted-foreground">部门范围</span>
          <span className="text-right font-medium">
            {department || '全部部门'}
          </span>
          <span className="text-muted-foreground">状态范围</span>
          <span className="text-right font-medium">{statusLabel}</span>
          {grade && (
            <>
              <span className="text-muted-foreground">绩效等级</span>
              <span className="text-right font-medium">{grade}</span>
            </>
          )}
          <span className="text-muted-foreground">未完成任务</span>
          <span className="text-right font-medium">
            {preview?.taskCount ?? 0} 项
          </span>
          <span className="text-muted-foreground">涉及员工</span>
          <span className="text-right font-medium">
            {preview?.employeeCount ?? 0} 人
          </span>
          <span className="text-muted-foreground">涉及上级</span>
          <span className="text-right font-medium">
            {preview?.supervisorCount ?? 0} 人
          </span>
          <span className="text-muted-foreground">预计消息</span>
          <span className="text-right font-medium">
            {preview?.expectedMessageCount ?? 0} 条
          </span>
        </div>

        {!!preview?.missingSupervisorCount && (
          <p className="text-sm text-warning-foreground">
            其中 {preview.missingSupervisorCount}{' '}
            项任务未配置上级，仅通知员工本人。
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={sending || !preview?.taskCount}
          >
            {sending ? '发送中...' : '确认发送'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default UnfinishedReminderDialog;

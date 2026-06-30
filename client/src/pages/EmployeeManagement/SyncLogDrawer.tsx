import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Download,
  Upload,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import * as api from '@/api/bitable-connection';
import type {
  BitableSyncLogItem,
  BitableSyncLogDetail,
} from '@shared/api.interface';

interface SyncLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
  }
> = {
  success: {
    label: '成功',
    variant: 'default',
    icon: <CheckCircle className="size-3.5" />,
  },
  partial: {
    label: '部分成功',
    variant: 'secondary',
    icon: <AlertTriangle className="size-3.5" />,
  },
  failed: {
    label: '失败',
    variant: 'destructive',
    icon: <XCircle className="size-3.5" />,
  },
};

const rowStatusConfig: Record<
  string,
  { label: string; className: string }
> = {
  created: { label: '新增', className: 'text-green-600' },
  updated: { label: '更新', className: 'text-blue-600' },
  skipped: { label: '跳过', className: 'text-amber-600' },
  failed: { label: '失败', className: 'text-red-600' },
};

const SyncLogDrawer: React.FC<SyncLogDrawerProps> = ({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}) => {
  const [logs, setLogs] = useState<BitableSyncLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] =
    useState<BitableSyncLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (open && connectionId) {
      setLoading(true);
      api
        .getLogs(connectionId, { page: 1, pageSize: 50 })
        .then((res) => setLogs(res.items))
        .finally(() => setLoading(false));
    }
  }, [open, connectionId]);

  const handleSelectLog = async (logId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await api.getLogDetail(connectionId, logId);
      setSelectedLog(detail);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {selectedLog
              ? '日志详情'
              : `同步日志 — ${connectionName}`}
          </SheetTitle>
        </SheetHeader>

        {selectedLog ? (
          <div className="flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLog(null)}
              >
                <ChevronRight className="size-4 rotate-180" />
                返回
              </Button>
              <Badge
                variant={
                  statusConfig[selectedLog.status]?.variant || 'outline'
                }
              >
                {statusConfig[selectedLog.status]?.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-4 p-3 rounded-lg bg-muted/50">
              <div>
                <span className="text-muted-foreground">总计</span>{' '}
                {selectedLog.totalCount}
              </div>
              <div>
                <span className="text-muted-foreground">新增</span>{' '}
                {selectedLog.createdCount}
              </div>
              <div>
                <span className="text-muted-foreground">更新</span>{' '}
                {selectedLog.updatedCount}
              </div>
              <div>
                <span className="text-muted-foreground">跳过</span>{' '}
                {selectedLog.skippedCount}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">失败</span>{' '}
                {selectedLog.failedCount}
              </div>
              {selectedLog.errorMessage && (
                <div className="col-span-2 text-red-600">
                  {selectedLog.errorMessage}
                </div>
              )}
            </div>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">行</TableHead>
                    <TableHead>工号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLog.details.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{d.row}</TableCell>
                      <TableCell>{d.employeeNo}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>
                        <span
                          className={
                            rowStatusConfig[d.status]?.className || ''
                          }
                        >
                          {rowStatusConfig[d.status]?.label ||
                            d.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {d.reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 mt-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">
                暂无同步记录
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {logs.map((log) => (
                  <button
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left w-full"
                    onClick={() => handleSelectLog(log.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {log.direction === 'import' ? (
                        <Download className="size-4 text-blue-500 shrink-0" />
                      ) : (
                        <Upload className="size-4 text-green-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {log.direction === 'import' ? '导入' : '导出'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.startedAt
                            ? new Date(log.startedAt).toLocaleString()
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          statusConfig[log.status]?.variant || 'outline'
                        }
                        className="text-xs"
                      >
                        {statusConfig[log.status]?.label}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default SyncLogDrawer;

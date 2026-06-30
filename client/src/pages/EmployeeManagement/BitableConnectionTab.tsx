import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import {
  Plus,
  Download,
  Upload,
  Pencil,
  Trash2,
  Link2,
  Clock,
  CheckCircle,
  XCircle,
  History,
} from 'lucide-react';
import BitableConnectionDialog from './BitableConnectionDialog';
import SyncLogDrawer from './SyncLogDrawer';
import * as api from '@/api/bitable-connection';
import type {
  BitableConnectionItem,
  CreateBitableConnectionRequest,
} from '@shared/api.interface';

const BitableConnectionTab: React.FC = () => {
  const [connections, setConnections] = useState<BitableConnectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BitableConnectionItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<BitableConnectionItem | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [logDrawer, setLogDrawer] = useState<{
    connectionId: string;
    connectionName: string;
  } | null>(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list({ page: 1, pageSize: 100 });
      setConnections(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleSave = async (data: CreateBitableConnectionRequest) => {
    if (editing) {
      await api.update(editing.id, data);
    } else {
      await api.create(data);
    }
    await fetchConnections();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.remove(deleteTarget.id);
    setDeleteTarget(null);
    await fetchConnections();
  };

  const handleImport = async (conn: BitableConnectionItem) => {
    setImportingId(conn.id);
    setImportResult(null);
    try {
      const result = await api.importEmployees(conn.id);
      setImportResult({
        created: result.createdCount,
        updated: result.updatedCount,
        skipped: result.skippedCount,
        failed: result.failedCount,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleExport = async (conn: BitableConnectionItem) => {
    setExportingId(conn.id);
    try {
      await api.exportEmployees(conn.id);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4" />共{' '}
          <span className="font-semibold text-foreground">
            {connections.length}
          </span>{' '}
          个连接
        </div>
        <CanRole roles={['admin']}>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            新建连接
          </Button>
        </CanRole>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Link2 className="size-8 opacity-30" />
            <p className="text-sm">暂无连接，点击上方按钮创建</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {connections.map((conn) => (
            <Card key={conn.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm">{conn.name}</h4>
                      <Badge
                        variant={conn.isActive ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {conn.isActive ? (
                          <CheckCircle className="size-3 mr-0.5" />
                        ) : (
                          <XCircle className="size-3 mr-0.5" />
                        )}
                        {conn.isActive ? '启用' : '停用'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conn.bitableAppToken} / {conn.tableId}
                    </p>
                    {conn.lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="size-3" />
                        最近同步: {new Date(conn.lastSyncAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <CanRole roles={['admin', 'hrd']}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImport(conn)}
                        disabled={importingId === conn.id}
                      >
                        <Download data-icon="inline-start" />
                        {importingId === conn.id ? '导入中...' : '导入'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExport(conn)}
                        disabled={exportingId === conn.id}
                      >
                        <Upload data-icon="inline-start" />
                        {exportingId === conn.id ? '导出中...' : '导出'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setLogDrawer({
                            connectionId: conn.id,
                            connectionName: conn.name,
                          })
                        }
                        title="同步日志"
                      >
                        <History className="size-4" />
                      </Button>
                    </CanRole>
                    <CanRole roles={['admin']}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(conn);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(conn)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </CanRole>
                  </div>
                </div>
                {importResult && importingId === null && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="text-green-600">
                      新增 {importResult.created}
                    </span>
                    <span className="text-blue-600">
                      更新 {importResult.updated}
                    </span>
                    <span className="text-amber-600">
                      跳过 {importResult.skipped}
                    </span>
                    {importResult.failed > 0 && (
                      <span className="text-red-600">
                        失败 {importResult.failed}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BitableConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除连接</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除连接「{deleteTarget?.name}
              」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {logDrawer && (
        <SyncLogDrawer
          open={!!logDrawer}
          onOpenChange={(open) => !open && setLogDrawer(null)}
          connectionId={logDrawer.connectionId}
          connectionName={logDrawer.connectionName}
        />
      )}
    </div>
  );
};

export default BitableConnectionTab;

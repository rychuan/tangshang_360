import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { CanDo } from '@/hooks/usePermissions';
import { COMMAND_PERMISSIONS } from '@/components/permission-policy';
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
  Info,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import BitableConnectionDialog from './BitableConnectionDialog';
import SyncLogDrawer from './SyncLogDrawer';
import * as api from '@/api/bitable-connection';
import type {
  BitableConnectionItem,
  CreateBitableConnectionRequest,
} from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';

const BitableConnectionTab: React.FC = () => {
  const queryClient = useQueryClient();

  const {
    data: connections = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['bitable-connections'],
    queryFn: () =>
      api.list({ page: 1, pageSize: 100 }).then((res) => res.items),
  });
  const error = queryError ? '获取连接列表失败' : null;

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
    error?: string;
  } | null>(null);
  const [logDrawer, setLogDrawer] = useState<{
    connectionId: string;
    connectionName: string;
  } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleSave = async (data: CreateBitableConnectionRequest) => {
    if (editing) {
      await api.update(editing.id, data);
    } else {
      await api.create(data);
    }
    await queryClient.invalidateQueries({ queryKey: ['bitable-connections'] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.remove(deleteTarget.id);
    setDeleteTarget(null);
    await queryClient.invalidateQueries({ queryKey: ['bitable-connections'] });
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
    } catch (err) {
      handleApiError(err);
      setImportResult({
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        error: '导入失败',
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleExport = async (conn: BitableConnectionItem) => {
    setExportingId(conn.id);
    try {
      await api.exportEmployees(conn.id);
    } catch (err) {
      handleApiError(err);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 使用说明 */}
      <Card className={showGuide ? '' : 'border-dashed'}>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 text-left h-auto"
          onClick={() => setShowGuide(!showGuide)}
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">使用说明</span>
            <span className="text-xs text-muted-foreground">
              — 多维表格导入/导出功能的逻辑与操作指引
            </span>
          </div>
          {showGuide ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </Button>
        {showGuide && (
          <CardContent className="px-4 pb-4 pt-0 space-y-4 text-sm">
            {/* 功能简介 */}
            <div>
              <h4 className="font-medium mb-1 flex items-center gap-1">
                <Info className="size-3.5" />
                功能简介
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                通过连接飞书多维表格，可以将表格中的员工数据批量导入系统，也支持将系统内的员工信息推送回多维表格。适合
                HR 在多维表格中统一维护员工基础信息，再一键同步到考核系统。
              </p>
            </div>

            {/* 连接配置 */}
            <div>
              <h4 className="font-medium mb-1">一、创建连接</h4>
              <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
                <li>在飞书开放平台创建企业自建应用，开通「多维表格」权限</li>
                <li>在多维表格中准备好员工数据（列名需符合下方约定）</li>
                <li>点击「新建连接」，填入应用凭据和表格 ID</li>
                <li>
                  App Token 在多维表格 URL 中获取（bascn 开头），子表 ID
                  从表格设置中获取
                </li>
              </ol>
            </div>

            {/* 列名约定 */}
            <div>
              <h4 className="font-medium mb-1">
                二、多维表格列名约定（固定映射）
              </h4>
              <p className="text-muted-foreground mb-2 text-xs">
                系统按列名自动识别字段，请严格使用以下列名。标注「必填」的列缺失时将跳过该行。
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="text-left">多维表格列名</TableHead>
                      <TableHead className="text-left">映射字段</TableHead>
                      <TableHead className="text-center">必填</TableHead>
                      <TableHead className="text-left">校验规则</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      ['姓名', 'name', '是', ''],
                      [
                        '工号',
                        'employeeNo',
                        '是',
                        '唯一标识，用于匹配已有员工',
                      ],
                      ['岗位', 'position', '是', '自由文本'],
                      [
                        '部门',
                        'department',
                        '否',
                        '必须为系统中已存在的部门名称，否则跳过',
                      ],
                      ['上级工号', '—', '否', '通过工号查找上级，找不到则为空'],
                      ['职位', 'title', '否', ''],
                      [
                        '角色',
                        'role',
                        '否',
                        'admin/hrd/dept_head/supervisor/employee',
                      ],
                      ['手机', 'phone', '否', ''],
                      ['入职日期', 'hireDate', '否', ''],
                      ['状态', 'status', '否', 'true/false'],
                      [
                        '考核模板',
                        '—',
                        '否',
                        '必须为系统中已存在的模板名称，导入后自动绑定',
                      ],
                    ].map(([col, field, required, rule]) => (
                      <TableRow key={col}>
                        <TableCell className="font-medium">{col}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {field}
                        </TableCell>
                        <TableCell className="text-center">
                          {required === '是' ? (
                            <span className="text-destructive">●</span>
                          ) : (
                            <span className="text-muted-foreground">○</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {rule}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* 导入逻辑 */}
            <div>
              <h4 className="font-medium mb-1">三、导入逻辑</h4>
              <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                <li>
                  <strong>匹配规则</strong>
                  ：按「工号」匹配系统已有员工。工号相同则更新，不存在则新增。
                </li>
                <li>
                  <strong>冲突处理</strong>
                  ：多维表格数据覆盖系统数据（表格为准）。
                </li>
                <li>
                  <strong>部门校验</strong>
                  ：填写了部门列时，部门名称必须存在于系统部门列表中，否则该行跳过。
                </li>
                <li>
                  <strong>考核模板</strong>
                  ：填写了考核模板列时，导入后自动为员工绑定该模板（已有绑定则不重复绑定）。
                </li>
                <li>
                  <strong>角色分配</strong>：新增员工自动加入「employee」角色。
                </li>
              </ul>
            </div>

            {/* 导出逻辑 */}
            <div>
              <h4 className="font-medium mb-1">四、导出逻辑</h4>
              <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                <li>
                  仅导出通过该连接导入的员工（按 bitable_connection_id 关联）。
                </li>
                <li>
                  导出内容：基本信息（姓名、工号、岗位、部门、职位、角色、手机、入职日期、状态），不包含考核数据。
                </li>
                <li>多维表格中已存在同工号的行会更新，不存在的会新增。</li>
              </ul>
            </div>

            {/* 注意事项 */}
            <div>
              <h4 className="font-medium mb-1">五、注意事项</h4>
              <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                <li>
                  飞书应用需开通「多维表格」和「通讯录」权限才能正常访问表格数据。
                </li>
                <li>App Secret 加密存储于数据库，不会暴露到前端。</li>
                <li>
                  每次导入/导出操作均记录完整日志，可在「同步日志」中查看行级处理结果。
                </li>
                <li>已停用的连接不可执行导入/导出操作。</li>
                <li>
                  如导入结果有「跳过」行，请查看同步日志了解具体原因（缺少必填字段、部门不存在等）。
                </li>
              </ul>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4" />共{' '}
          <span className="font-semibold text-foreground">
            {connections.length}
          </span>{' '}
          个连接
        </div>
        <CanRole roles={['admin']}>
          <CanDo {...COMMAND_PERMISSIONS.employeeSync}>
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
          </CanDo>
        </CanRole>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <XCircle className="size-8 opacity-30 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ['bitable-connections'],
                })
              }
            >
              重试
            </Button>
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
                      <CanDo {...COMMAND_PERMISSIONS.employeeSync}>
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
                      </CanDo>
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
                      <CanDo {...COMMAND_PERMISSIONS.employeeSync}>
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
                      </CanDo>
                    </CanRole>
                  </div>
                </div>
                {importResult && importingId === null && (
                  <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {importResult.error ? (
                      <span className="text-destructive">
                        {importResult.error}
                      </span>
                    ) : (
                      <>
                        <span className="text-success font-medium">
                          新增 {importResult.created}
                        </span>
                        <span className="text-primary font-medium">
                          更新 {importResult.updated}
                        </span>
                        <span className="text-warning font-medium">
                          跳过 {importResult.skipped}
                        </span>
                        {importResult.failed > 0 && (
                          <span className="text-destructive font-medium">
                            失败 {importResult.failed}
                          </span>
                        )}
                      </>
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
              data-variant="destructive"
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

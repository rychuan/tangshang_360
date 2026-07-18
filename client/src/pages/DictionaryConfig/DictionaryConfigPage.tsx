import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import dictApi from '@/api/dictionary';
import type { DictEntry, CreateDictRequest } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Database } from 'lucide-react';
import { handleApiError } from '@/utils/api-error';
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
import { PageHeader } from '@/components/business-ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CanDo, usePermission } from '@/hooks/usePermissions';
import { COMMAND_PERMISSIONS } from '@/components/permission-policy';

/** 字典类型注册表 — 新增类型在此注册即自动出现在 Tab 中 */
const DICT_TYPES: { type: string; label: string; desc: string }[] = [
  {
    type: 'position',
    label: '岗位字典',
    desc: '管理系统中的岗位，新建员工时可下拉选择。',
  },
];

/** 单类型面板：独立管理一个字典类型的数据加载和 CRUD */
const DictPanel: React.FC<{ dictType: string }> = ({ dictType }) => {
  const api = useMemo(() => dictApi(dictType), [dictType]);
  const queryClient = useQueryClient();
  const canEdit = usePermission(
    COMMAND_PERMISSIONS.dictionaryEdit.resource,
    COMMAND_PERMISSIONS.dictionaryEdit.action,
  );

  const { data, isLoading: loading } = useQuery({
    queryKey: ['dictionary', dictType],
    queryFn: async () => {
      const res = await api.list();
      const items = res?.items;
      return Array.isArray(items) ? items : [];
    },
  });
  const items = Array.isArray(data) ? data : [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DictEntry | null>(null);
  const [form, setForm] = useState({ code: '', name: '', sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DictEntry | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ code: '', name: '', sortOrder: 0 });
    setDialogOpen(true);
  };
  const openEdit = (item: DictEntry) => {
    setEditingItem(item);
    setForm({ code: item.code, name: item.name, sortOrder: item.sortOrder });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请输入名称');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateDictRequest = {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        sortOrder: form.sortOrder,
      };
      if (editingItem) {
        await api.update(editingItem.id, payload);
        toast.success('已更新');
      } else {
        await api.create(payload);
        toast.success('已创建');
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dictionary', dictType] });
    } catch (e: unknown) {
      handleApiError(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.remove(deleteTarget.id);
      toast.success('已删除');
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dictionary', dictType] });
    } catch (e: unknown) {
      handleApiError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="size-4" />共 {items.length} 个条目
          </CardTitle>
          <CanDo {...COMMAND_PERMISSIONS.dictionaryEdit}>
            <Button size="sm" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              新建
            </Button>
          </CanDo>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="size-6" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="size-10 mb-2 opacity-30" />
              <p className="text-sm">暂无数据</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-muted/50">
                  <TableHead className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">
                    编码
                  </TableHead>
                  <TableHead className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">
                    名称
                  </TableHead>
                  <TableHead className="h-10 px-4 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    排序
                  </TableHead>
                  <TableHead className="h-10 px-4 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    状态
                  </TableHead>
                  {canEdit && (
                    <TableHead className="h-10 px-4 sticky right-0 bg-background z-20 border-l text-xs font-medium text-muted-foreground">
                      操作
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="group border-b hover:bg-muted/30"
                  >
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground font-mono">
                      {item.code}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-medium">
                      {item.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {item.sortOrder}
                    </TableCell>
                    <TableCell className="px-4 py-3 hidden sm:table-cell">
                      <Badge
                        variant={item.isActive ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {item.isActive ? '启用' : '停用'}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="px-4 py-3 sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l">
                        <div className="flex items-center gap-1">
                          <ActionBadge
                            actionType="edit"
                            icon={<Pencil className="size-3" />}
                            label=""
                            onClick={() => openEdit(item)}
                          />
                          <ActionBadge
                            actionType="delete"
                            icon={<Trash2 className="size-3" />}
                            label=""
                            onClick={() => {
                              setDeleteTarget(item);
                              setDeleteOpen(true);
                            }}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑' : '新建'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="code">
                编码
              </Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="唯一标识，留空则使用名称"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="name">
                名称 *
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="显示名称"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="sortOrder"
              >
                排序
              </Label>
              <Input
                id="sortOrder"
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sortOrder: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <CanDo {...COMMAND_PERMISSIONS.dictionaryEdit}>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Spinner className="mr-2 size-4" />}
                {editingItem ? '保存' : '创建'}
              </Button>
            </CanDo>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？若正在被使用则无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <CanDo {...COMMAND_PERMISSIONS.dictionaryEdit}>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确认删除
              </AlertDialogAction>
            </CanDo>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const DictionaryConfigPage: React.FC = () => {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();

  // 确定激活的 tab：优先 URL 参数，否则默认第一个
  const activeType =
    type && DICT_TYPES.some((t) => t.type === type)
      ? type
      : DICT_TYPES[0]?.type || '';

  const handleTabChange = (t: string) => {
    navigate(`/dictionary/${t}`, { replace: true });
  };

  const activeMeta = DICT_TYPES.find((t) => t.type === activeType);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="字段管理"
        description="管理系统中的各类字典数据，支持岗位、职级等字段的统一定义与维护。"
      />

      <Tabs value={activeType} onValueChange={handleTabChange}>
        <TabsList>
          {DICT_TYPES.map((dt) => (
            <TabsTrigger key={dt.type} value={dt.type}>
              {dt.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DICT_TYPES.map((dt) => (
          <TabsContent key={dt.type} value={dt.type} className="mt-4">
            {dt.desc && (
              <p className="text-sm text-muted-foreground mb-4">{dt.desc}</p>
            )}
            <DictPanel dictType={dt.type} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default DictionaryConfigPage;

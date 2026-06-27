import React, { useState, useEffect, useCallback } from 'react';
import { position as positionApi } from '@/api';
import type {
  PositionItem,
  CreatePositionRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react';
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

const PositionConfigPage: React.FC = () => {
  const [items, setItems] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PositionItem | null>(null);
  const [formData, setFormData] = useState<{ name: string; sortOrder: number }>(
    {
      name: '',
      sortOrder: 0,
    },
  );
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PositionItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await positionApi.list();
      setItems(res.items);
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: '', sortOrder: 0 });
    setDialogOpen(true);
  };

  const openEdit = (item: PositionItem) => {
    setEditingItem(item);
    setFormData({ name: item.name, sortOrder: item.sortOrder });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入岗位名称');
      return;
    }
    setSaving(true);
    try {
      const payload: CreatePositionRequest = {
        name: formData.name.trim(),
        sortOrder: formData.sortOrder,
      };
      if (editingItem) {
        await positionApi.update(editingItem.id, payload);
        toast.success('岗位已更新');
      } else {
        await positionApi.create(payload);
        toast.success('岗位已创建');
      }
      setDialogOpen(false);
      loadData();
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (item: PositionItem) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await positionApi.remove(deleteTarget.id);
      toast.success('岗位已删除');
      setDeleteOpen(false);
      loadData();
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="岗位管理"
        description="管理系统中的岗位字典，新建员工时可下拉选择。"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="size-4" />
            岗位列表
            <span className="text-sm font-normal text-muted-foreground">
              （共 {items.length} 个）
            </span>
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            新建岗位
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Briefcase className="size-10 mb-2 opacity-30" />
              <p className="text-sm">暂无岗位数据</p>
              <p className="text-xs mt-1">点击「新建岗位」开始添加</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground">
                      岗位名称
                    </th>
                    <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                      排序
                    </th>
                    <th className="h-10 px-4 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                      状态
                    </th>
                    <th className="h-10 px-4 text-right text-xs font-medium text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {item.sortOrder}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge
                          variant={item.isActive ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {item.isActive ? '启用' : '停用'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDelete(item)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑岗位' : '新建岗位'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                岗位名称 *
              </Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例如：前端工程师"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                排序
              </Label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editingItem ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除岗位</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除岗位「{deleteTarget?.name}
              」吗？若该岗位正在被员工使用则无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PositionConfigPage;

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Eye, Pencil, Ban, Search, RotateCcw } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Button } from '@client/src/components/ui/button';
import { handleApiError } from '@client/src/utils/api-error';
import { Input } from '@client/src/components/ui/input';
import { Badge } from '@client/src/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@client/src/components/ui/alert-dialog';
import TemplateFormDialog from './TemplateFormDialog';
import TemplatePreviewDialog from './TemplatePreviewDialog';
import * as assessmentTemplateApi from '@client/src/api/assessment-template';
import type {
  AssessmentTemplateItem,
  AssessmentTemplateDetail,
  CreateTemplateRequest,
} from '@shared/api.interface';

const POSITION_OPTIONS: string[] = [
  '销售经理',
  '客户成功经理',
  '技术支持工程师',
  '产品经理',
  '研发工程师',
  '市场专员',
];

const TemplateManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AssessmentTemplateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterPosition, setFilterPosition] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<AssessmentTemplateDetail | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] =
    useState<AssessmentTemplateDetail | null>(null);

  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<
    Record<string, AssessmentTemplateDetail>
  >({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assessmentTemplateApi.list({
        page,
        pageSize,
        keyword: searchKeyword || undefined,
        position: filterPosition || undefined,
        status: filterStatus || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '加载失败';
      logger.error('fetchList error:', msg);
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchKeyword, filterPosition, filterStatus]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearch = () => {
    setPage(1);
    setSearchKeyword(keyword);
  };

  const handleReset = () => {
    setKeyword('');
    setSearchKeyword('');
    setFilterPosition('');
    setFilterStatus('');
    setPage(1);
  };

  const handleCreate = async (data: CreateTemplateRequest) => {
    await assessmentTemplateApi.create(data);
    toast.success('模板创建成功');
    await fetchList();
  };

  const handleEdit = async (id: string) => {
    try {
      const detail = await assessmentTemplateApi.detail(id);
      setDetailCache((prev) => ({ ...prev, [id]: detail }));
      setEditingTemplate(detail);
      setFormOpen(true);
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleUpdate = async (data: CreateTemplateRequest) => {
    if (!editingTemplate) return;
    await assessmentTemplateApi.update(editingTemplate.id, data);
    toast.success('模板更新成功');
    setEditingTemplate(null);
    setDetailCache((prev) => {
      const next = { ...prev };
      delete next[editingTemplate.id];
      return next;
    });
    await fetchList();
  };

  const handlePreview = async (id: string) => {
    const cached = detailCache[id];
    if (cached) {
      setPreviewTemplate(cached);
      setPreviewOpen(true);
      return;
    }
    try {
      const detail = await assessmentTemplateApi.detail(id);
      setDetailCache((prev) => ({ ...prev, [id]: detail }));
      setPreviewTemplate(detail);
      setPreviewOpen(true);
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateId) return;
    try {
      await assessmentTemplateApi.deactivate(deactivateId);
      toast.success('模板已停用');
      setDeactivateId(null);
      await fetchList();
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingTemplate(null);
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatCreatedAt = (createdAt: string): string => {
    const d = new Date(createdAt);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">考核模板管理</h1>
        <CanRole roles={['admin', 'hrd']}>
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4 mr-2" />
            新建模板
          </Button>
        </CanRole>
      </div>

      <div className="flex flex-wrap items-center gap-3" data-ai-section-type="card-list">
        <Input
          placeholder="搜索模板名称..."
          value={keyword}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setKeyword(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') handleSearch();
          }}
          className="w-56"
        />
        <Select
          value={filterPosition}
          onValueChange={(v: string) => {
            setFilterPosition(v === 'all' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="岗位筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部岗位</SelectItem>
            {POSITION_OPTIONS.map((pos: string) => (
              <SelectItem key={pos} value={pos}>
                {pos}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v: string) => {
            setFilterStatus(v === 'all' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="inactive">停用</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={handleSearch}>
          <Search className="size-4 mr-1" />
          搜索
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4 mr-1" />
          重置
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">暂无数据</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 pr-4 font-medium text-left">模板名称</th>
                    <th className="py-3 pr-4 font-medium text-left">适用岗位</th>
                    <th className="py-3 pr-4 font-medium text-left">考核类型</th>
                    <th className="py-3 pr-4 font-medium text-left">状态</th>
                    <th className="py-3 pr-4 font-medium text-left">创建时间</th>
                    <th className="py-3 pr-4 font-medium text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: AssessmentTemplateItem) => (
                    <tr key={item.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 pr-4">{item.name}</td>
                      <td className="py-3 pr-4">{item.position}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{item.type === 'monthly' ? '月度考核' : '试用期考核'}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {item.isActive ? <Badge variant="default">启用</Badge> : <Badge variant="secondary">停用</Badge>}
                      </td>
                      <td className="py-3 pr-4">{formatCreatedAt(item.createdAt)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handlePreview(item.id)}>
                            <Eye className="size-4 mr-1" />预览
                          </Button>
                          <CanRole roles={['admin', 'hrd']}>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(item.id)}>
                              <Pencil className="size-4 mr-1" />编辑
                            </Button>
                          </CanRole>
                          {item.isActive && (
                            <CanRole roles={['admin', 'hrd']}>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeactivateId(item.id)}>
                                <Ban className="size-4 mr-1" />停用
                              </Button>
                            </CanRole>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">共 {total} 条</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p: number) => Math.max(1, p - 1))}>上一页</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}>下一页</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        onSave={editingTemplate ? handleUpdate : handleCreate}
      />

      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        template={previewTemplate}
      />

      <AlertDialog
        open={!!deactivateId}
        onOpenChange={(open: boolean) => {
          if (!open) setDeactivateId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认停用</AlertDialogTitle>
            <AlertDialogDescription>
              停用后该模板将不再用于新的考核，但已发布的考核不受影响。确认停用？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>
              确认停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TemplateManagementPage;
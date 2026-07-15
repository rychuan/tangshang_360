import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { toast } from 'sonner';
import { Plus, Eye, Ban, Trash2, Search, RotateCcw } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { Button } from '@client/src/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { handleApiError } from '@client/src/utils/api-error';
import { Input } from '@client/src/components/ui/input';
import { Badge } from '@client/src/components/ui/badge';
import dictionaryApi from '@/api/dictionary';
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { PageHeader } from '@/components/business-ui/page-header';
import {
  FilterBar,
  FilterBarActions,
} from '@/components/business-ui/filter-bar';
import {
  PageTable,
  PageTableColumn,
} from '@/components/business-ui/page-table';
import TemplateFormDialog from './TemplateFormDialog';
import { POSITION_OPTIONS } from './TemplateFormDialog.types';
import TemplatePreviewDialog from './TemplatePreviewDialog';
import * as assessmentTemplateApi from '@client/src/api/assessment-template';
import type {
  AssessmentTemplateItem,
  AssessmentTemplateDetail,
  CreateTemplateRequest,
} from '@shared/api.interface';

const TemplateManagementPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 20;
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<
    Record<string, AssessmentTemplateDetail>
  >({});

  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [
      'templates',
      'list',
      {
        page,
        pageSize,
        keyword: searchKeyword,
        position: filterPosition,
        status: filterStatus,
      },
    ],
    queryFn: () =>
      assessmentTemplateApi.list({
        page,
        pageSize,
        keyword: searchKeyword || undefined,
        position: filterPosition || undefined,
        status: filterStatus || undefined,
      }),
  });

  const positionsQuery = useQuery({
    queryKey: ['dictionary', 'position', 'active'],
    queryFn: () => dictionaryApi('position').list(undefined, true),
    staleTime: 5 * 60 * 1000,
  });

  const loading = listQuery.isLoading;
  const items: AssessmentTemplateItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const positions: string[] =
    positionsQuery.data?.items
      ?.filter((p: { isActive: boolean; name: string }) => p.isActive)
      .map((p: { name: string }) => p.name) ?? POSITION_OPTIONS;
  const positionsLoading = positionsQuery.isLoading;

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
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
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
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
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
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await assessmentTemplateApi.remove(deleteId);
      toast.success('模板已删除');
      setDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
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

  const templateColumns: PageTableColumn<AssessmentTemplateItem>[] = [
    { key: 'name', header: '模板名称', render: (item) => item.name },
    { key: 'position', header: '适用岗位', render: (item) => item.position },
    {
      key: 'type',
      header: '绩效类型',
      render: (item) => (
        <Badge variant="outline">
          {item.type === 'monthly' ? '月度绩效' : '试用期绩效'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (item) =>
        item.isActive ? (
          <Badge variant="default">启用</Badge>
        ) : (
          <Badge variant="secondary">停用</Badge>
        ),
    },
    {
      key: 'createdAt',
      header: '创建时间',
      render: (item) => formatCreatedAt(item.createdAt),
    },
    {
      key: 'actions',
      header: '操作',
      headerClassName: 'sticky right-0 bg-background z-20 border-l',
      className:
        'sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l',
      render: (item) => (
        <div className="flex items-center gap-1">
          <ActionBadge
            actionType="view"
            icon={<Eye className="size-3" />}
            label="查看"
            onClick={() => handleEdit(item.id)}
          />
          {item.isActive && (
            <CanRole roles={['admin', 'hrd']}>
              <CanDo resource="template_management" action="delete">
                <ActionBadge
                  actionType="deactivate"
                  icon={<Ban className="size-3" />}
                  label="停用"
                  onClick={() => setDeactivateId(item.id)}
                />
              </CanDo>
            </CanRole>
          )}
          {!item.isActive && (
            <CanRole roles={['admin', 'hrd']}>
              <CanDo resource="template_management" action="delete">
                <ActionBadge
                  actionType="delete"
                  icon={<Trash2 className="size-3" />}
                  label="删除"
                  onClick={() => setDeleteId(item.id)}
                />
              </CanDo>
            </CanRole>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="绩效模板管理"
        actions={
          <CanRole roles={['admin', 'hrd']}>
            <CanDo resource="template_management" action="edit">
              <Button onClick={handleOpenCreate}>
                <Plus data-icon="inline-start" />
                新建模板
              </Button>
            </CanDo>
          </CanRole>
        }
      />

      <FilterBar data-ai-section-type="card-list">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">搜索</Label>
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
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">岗位</Label>
          {positionsLoading ? (
            <Skeleton className="w-40 h-10" />
          ) : (
            <Select
              value={filterPosition}
              onValueChange={(v: string) => {
                setFilterPosition(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部岗位" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部岗位</SelectItem>
                  {positions.map((pos: string) => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">状态</Label>
          <Select
            value={filterStatus}
            onValueChange={(v: string) => {
              setFilterStatus(v === 'all' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <FilterBarActions>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground invisible">
              占位
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleSearch}>
                <Search data-icon="inline-start" />
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw data-icon="inline-start" />
                重置
              </Button>
            </div>
          </div>
        </FilterBarActions>
      </FilterBar>

      <PageTable
        columns={templateColumns}
        data={items}
        loading={loading}
        emptyMessage="暂无数据"
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
      />

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        onSave={editingTemplate ? handleUpdate : handleCreate}
        positions={positions}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后模板将被移除（关联数据保留、绑定关系自动停用）。此操作不可撤销，确认删除？
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
              停用后该模板将不再用于新的绩效，但已发布的绩效不受影响。确认停用？
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

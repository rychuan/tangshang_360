import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Award } from '@/components/ui/hugeicons';
import { CanDo } from '@/hooks/usePermissions';
import { Button } from '@client/src/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Badge } from '@client/src/components/ui/badge';
import { PageHeader } from '@/components/business-ui/page-header';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@client/src/components/ui/alert-dialog';
import { useGradeConfig } from './useGradeConfig';
import { CoverageBanner } from './CoverageBanner';
import { GradeFormDialog } from './GradeFormDialog';
import type { PerformanceGradeItem } from '@shared/api.interface';
import { PageTable } from '@/components/business-ui/page-table';
import type { PageTableColumn } from '@/components/business-ui/page-table';

const GradeConfigPage: React.FC = () => {
  const {
    loading,
    submitting,
    sortedItems,
    coverage,
    createGrade,
    updateGrade,
    deleteGrade,
  } = useGradeConfig();

  const [formOpen, setFormOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<PerformanceGradeItem | null>(
    null,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditingGrade(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (grade: PerformanceGradeItem) => {
    setEditingGrade(grade);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingGrade(null);
  };

  const handleSubmit = async (data: {
    name: string;
    minScore: number;
    maxScore: number;
    sortOrder: number;
    isActive: boolean;
  }) => {
    return editingGrade
      ? updateGrade(editingGrade.id, data)
      : createGrade(data);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const success = await deleteGrade(deleteId);
    if (success) {
      setDeleteId(null);
    }
  };

  const gradeColumns: PageTableColumn<PerformanceGradeItem>[] = [
    { key: 'name', header: '等级名称', render: (item) => item.name },
    {
      key: 'scoreRange',
      header: '分数区间',
      render: (item) => `${item.minScore} ~ ${item.maxScore}`,
    },
    { key: 'sortOrder', header: '排序值', render: (item) => item.sortOrder },
    {
      key: 'coefficient',
      header: '绩效系数',
      render: (item) => item.coefficient || '-',
    },
    {
      key: 'isActive',
      header: '启用状态',
      render: (item) =>
        item.isActive ? (
          <Badge variant="default">启用</Badge>
        ) : (
          <Badge variant="secondary">停用</Badge>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      headerClassName: 'sticky right-0 bg-background z-20 border-l',
      className:
        'sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l',
      render: (item) => (
        <div className="flex items-center gap-1">
          <CanDo resource="grade_config" action="edit">
            <ActionBadge
              actionType="edit"
              icon={<Pencil className="size-3" />}
              label="编辑"
              onClick={() => handleOpenEdit(item)}
            />
          </CanDo>
          <CanDo resource="grade_config" action="edit">
            <ActionBadge
              actionType="delete"
              icon={<Trash2 className="size-3" />}
              label="删除"
              onClick={() => setDeleteId(item.id)}
            />
          </CanDo>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="绩效等级配置"
        description="管理绩效分数对应的绩效等级规则"
        actions={
          <CanDo resource="grade_config" action="edit">
            <Button onClick={handleOpenCreate}>
              <Plus data-icon="inline-start" />
              新建等级
            </Button>
          </CanDo>
        }
      />

      <CoverageBanner coverage={coverage} />

      <PageTable
        columns={gradeColumns}
        data={sortedItems}
        loading={loading}
        rowKey={(item) => item.id}
        emptyIcon={<Award className="size-6" />}
      />

      <GradeFormDialog
        open={formOpen}
        onOpenChange={(open: boolean) => {
          if (!open) handleCloseForm();
          else setFormOpen(true);
        }}
        editingGrade={editingGrade}
        submitting={submitting}
        onSubmit={handleSubmit}
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
              删除后该等级规则将立即失效，可能影响绩效等级的判定。确认删除？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GradeConfigPage;

import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Button } from '@client/src/components/ui/button';
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="绩效等级配置"
        description="管理绩效分数对应的绩效等级规则"
        actions={
          <CanRole roles={['admin', 'hrd']}>
            <Button onClick={handleOpenCreate}>
              <Plus className="size-4 mr-2" />
              新建等级
            </Button>
          </CanRole>
        }
      />

      <CoverageBanner coverage={coverage} />

      <div className="overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            加载中...
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-3 px-4 font-medium text-left">等级名称</th>
                  <th className="py-3 px-4 font-medium text-left">分数区间</th>
                  <th className="py-3 px-4 font-medium text-left">排序值</th>
                  <th className="py-3 px-4 font-medium text-left">启用状态</th>
                  <th className="py-3 px-4 font-medium text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item: PerformanceGradeItem) => (
                  <tr key={item.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">{item.name}</td>
                    <td className="py-3 px-4">
                      {item.minScore} ~ {item.maxScore}
                    </td>
                    <td className="py-3 px-4">{item.sortOrder}</td>
                    <td className="py-3 px-4">
                      {item.isActive ? (
                        <Badge variant="default">启用</Badge>
                      ) : (
                        <Badge variant="secondary">停用</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <CanRole roles={['admin', 'hrd']}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(item)}
                          >
                            <Pencil className="size-4 mr-1" />
                            编辑
                          </Button>
                        </CanRole>
                        <CanRole roles={['admin', 'hrd']}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="size-4 mr-1" />
                            删除
                          </Button>
                        </CanRole>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

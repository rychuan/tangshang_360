import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Award } from 'lucide-react';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
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
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

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
            <CanDo resource="grade_config" action="edit">
              <Button onClick={handleOpenCreate}>
                <Plus data-icon="inline-start" />
                新建等级
              </Button>
            </CanDo>
          </CanRole>
        }
      />

      <CoverageBanner coverage={coverage} />

      <div className="overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-6" />
          </div>
        ) : sortedItems.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Award className="size-6" />
              </EmptyMedia>
              <EmptyTitle>暂无数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b text-muted-foreground">
                <TableHead className="py-3 px-4 font-medium text-left">
                  等级名称
                </TableHead>
                <TableHead className="py-3 px-4 font-medium text-left">
                  分数区间
                </TableHead>
                <TableHead className="py-3 px-4 font-medium text-left">
                  排序值
                </TableHead>
                <TableHead className="py-3 px-4 font-medium text-left">
                  启用状态
                </TableHead>
                <TableHead className="py-3 px-4 font-medium text-left sticky right-0 bg-background z-20 border-l">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item: PerformanceGradeItem) => (
                <TableRow
                  key={item.id}
                  className="group border-b hover:bg-muted/50"
                >
                  <TableCell className="py-3 px-4">{item.name}</TableCell>
                  <TableCell className="py-3 px-4">
                    {item.minScore} ~ {item.maxScore}
                  </TableCell>
                  <TableCell className="py-3 px-4">{item.sortOrder}</TableCell>
                  <TableCell className="py-3 px-4">
                    {item.isActive ? (
                      <Badge variant="default">启用</Badge>
                    ) : (
                      <Badge variant="secondary">停用</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4 sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l">
                    <div className="flex items-center gap-1">
                      <CanRole roles={['admin', 'hrd']}>
                        <CanDo resource="grade_config" action="edit">
                          <ActionBadge
                            actionType="edit"
                            icon={<Pencil className="size-3" />}
                            label="编辑"
                            onClick={() => handleOpenEdit(item)}
                          />
                        </CanDo>
                      </CanRole>
                      <CanRole roles={['admin', 'hrd']}>
                        <CanDo resource="grade_config" action="edit">
                          <ActionBadge
                            actionType="delete"
                            icon={<Trash2 className="size-3" />}
                            label="删除"
                            onClick={() => setDeleteId(item.id)}
                          />
                        </CanDo>
                      </CanRole>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

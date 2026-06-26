import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Badge } from '@client/src/components/ui/badge';
import { PageHeader } from '@/components/business-ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@client/src/components/ui/form';
import { handleApiError } from '@client/src/utils/api-error';
import * as performanceGradeApi from '@client/src/api/performance-grade';
import type {
  PerformanceGradeItem,
  CreatePerformanceGradeRequest,
} from '@shared/api.interface';

const gradeSchema = z.object({
  name: z.string().min(1, '等级名称不能为空'),
  minScore: z.coerce
    .number()
    .min(0, '最低分不能小于0')
    .max(100, '最低分不能大于100'),
  maxScore: z.coerce
    .number()
    .min(1, '最高分不能小于1')
    .max(101, '最高分不能大于101'),
  sortOrder: z.coerce.number().min(0, '排序值不能小于0'),
  isActive: z.boolean(),
});

type GradeFormData = z.infer<typeof gradeSchema>;

const EMPTY_DEFAULTS: GradeFormData = {
  name: '',
  minScore: 0,
  maxScore: 100,
  sortOrder: 0,
  isActive: true,
};

interface CoverageResult {
  covered: boolean;
  message: string;
}

function checkCoverage(grades: PerformanceGradeItem[]): CoverageResult {
  const active = grades
    .filter((g) => g.isActive)
    .sort((a, b) => a.minScore - b.minScore);
  if (active.length === 0) {
    return { covered: false, message: '无启用的等级规则' };
  }
  if (active[0].minScore !== 0) {
    return { covered: false, message: '最低等级的起始分应为0' };
  }
  for (let i = 0; i < active.length - 1; i++) {
    if (active[i].maxScore !== active[i + 1].minScore) {
      return {
        covered: false,
        message: `等级「${active[i].name}」与「${active[i + 1].name}」之间存在分数缺口`,
      };
    }
  }
  if (active[active.length - 1].maxScore < 100) {
    return { covered: false, message: '最高等级的截止分应至少为100' };
  }
  return { covered: true, message: '当前配置已完整覆盖0-100分区间' };
}

const GradeConfigPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PerformanceGradeItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<PerformanceGradeItem | null>(
    null,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<GradeFormData>({
    resolver: zodResolver(gradeSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const coverage = checkCoverage(items);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await performanceGradeApi.list();
      setItems(res?.items ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      logger.error('fetchGradeList error:', msg);
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleOpenCreate = () => {
    setEditingGrade(null);
    form.reset(EMPTY_DEFAULTS);
    setFormOpen(true);
  };

  const handleOpenEdit = (grade: PerformanceGradeItem) => {
    setEditingGrade(grade);
    form.reset({
      name: grade.name,
      minScore: grade.minScore,
      maxScore: grade.maxScore,
      sortOrder: grade.sortOrder,
      isActive: grade.isActive,
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingGrade(null);
    form.reset(EMPTY_DEFAULTS);
  };

  const onSubmit = async (data: GradeFormData) => {
    setSubmitting(true);
    try {
      const payload: CreatePerformanceGradeRequest = {
        name: data.name,
        minScore: data.minScore,
        maxScore: data.maxScore,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      };
      if (editingGrade) {
        await performanceGradeApi.update(editingGrade.id, payload);
        toast.success('等级配置更新成功');
      } else {
        await performanceGradeApi.create(payload);
        toast.success('等级配置创建成功');
      }
      handleCloseForm();
      await fetchList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      logger.error('submitGrade error:', msg);
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setSubmitting(true);
    try {
      await performanceGradeApi.remove(deleteId);
      toast.success('等级配置已删除');
      setDeleteId(null);
      await fetchList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败';
      logger.error('deleteGrade error:', msg);
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="绩效等级配置"
        description="管理考核分数对应的绩效等级规则"
        actions={
          <CanRole roles={['admin', 'hrd']}>
            <Button onClick={handleOpenCreate}>
              <Plus className="size-4 mr-2" />
              新建等级
            </Button>
          </CanRole>
        }
      />

      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
          coverage.covered
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50'
        }`}
        data-ai-section-type="card-stat"
      >
        {coverage.covered ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
        ) : (
          <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
        )}
        <div className="text-sm">
          <p
            className={`font-medium ${
              coverage.covered ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {coverage.covered ? '配置覆盖正常' : '配置覆盖异常'}
          </p>
          <p
            className={coverage.covered ? 'text-emerald-700' : 'text-amber-700'}
          >
            {coverage.message}
          </p>
        </div>
      </div>

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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          onOpenAutoFocus={(e: Event) => e.preventDefault()}
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{editingGrade ? '编辑等级' : '新建等级'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              id="grade-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>等级名称</FormLabel>
                    <FormControl>
                      <Input placeholder="如：优秀" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>最低分</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>最高分</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={101} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>排序值</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>启用状态</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v: string) =>
                        field.onChange(v === 'true')
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择状态" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">启用</SelectItem>
                        <SelectItem value="false">停用</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseForm}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" form="grade-form" disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              删除后该等级规则将立即失效，可能影响考核等级的判定。确认删除？
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

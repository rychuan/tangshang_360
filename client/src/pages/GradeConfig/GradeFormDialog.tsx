import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@client/src/components/ui/button';
import { Spinner } from '@client/src/components/ui/spinner';
import { Input } from '@client/src/components/ui/input';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@client/src/components/ui/form';
import type {
  PerformanceGradeItem,
  CreatePerformanceGradeRequest,
} from '@shared/api.interface';

const gradeSchema = z
  .object({
    name: z.string().min(1, '等级名称不能为空'),
    minScore: z.coerce
      .number()
      .int('最低分必须为整数')
      .min(0, '最低分不能小于0')
      .max(150, '最低分不能大于150'),
    maxScore: z.coerce
      .number()
      .int('最高分必须为整数')
      .min(1, '最高分不能小于1')
      .max(151, '最高分不能大于151'),
    coefficient: z.string().optional(),
    sortOrder: z.coerce
      .number()
      .int('排序值必须为整数')
      .min(0, '排序值不能小于0'),
    isActive: z.boolean(),
  })
  .refine((data) => data.minScore < data.maxScore, {
    message: '最低分必须小于最高分',
    path: ['maxScore'],
  });

type GradeFormData = z.infer<typeof gradeSchema>;

const EMPTY_DEFAULTS: GradeFormData = {
  name: '',
  minScore: 0,
  maxScore: 150,
  coefficient: '',
  sortOrder: 0,
  isActive: true,
};

interface GradeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingGrade: PerformanceGradeItem | null;
  submitting: boolean;
  onSubmit: (data: CreatePerformanceGradeRequest) => Promise<boolean>;
}

export function GradeFormDialog({
  open,
  onOpenChange,
  editingGrade,
  submitting,
  onSubmit,
}: GradeFormDialogProps) {
  const form = useForm<GradeFormData>({
    resolver: zodResolver(gradeSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      if (editingGrade) {
        form.reset({
          name: editingGrade.name,
          minScore: editingGrade.minScore,
          maxScore: editingGrade.maxScore,
          coefficient: editingGrade.coefficient ?? '',
          sortOrder: editingGrade.sortOrder,
          isActive: editingGrade.isActive,
        });
      } else {
        form.reset(EMPTY_DEFAULTS);
      }
    }
  }, [open, editingGrade, form]);

  const handleSubmit = async (data: GradeFormData) => {
    const success = await onSubmit({
      name: data.name,
      minScore: data.minScore,
      maxScore: data.maxScore,
      coefficient: data.coefficient || undefined,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    });
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onSubmit={form.handleSubmit(handleSubmit)}
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
                      <Input type="number" min={0} max={150} {...field} />
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
                      <Input type="number" min={1} max={151} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="coefficient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>绩效系数</FormLabel>
                  <FormControl>
                    <Input placeholder="如：1.0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                    onValueChange={(v: string) => field.onChange(v === 'true')}
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
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="submit" form="grade-form" disabled={submitting}>
            {submitting && <Spinner className="mr-2 size-4" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

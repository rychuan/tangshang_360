import React, { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@client/src/components/ui/form';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Separator } from '@client/src/components/ui/separator';
import { logger } from '@lark-apaas/client-toolkit/logger';
import IndicatorsFieldArray from './TemplateIndicatorFields';
import {
  formSchema,
  POSITION_OPTIONS,
  type FormData,
} from './TemplateFormDialog.types';
import type {
  AssessmentTemplateDetail,
  CreateTemplateRequest,
} from '@shared/api.interface';

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AssessmentTemplateDetail | null;
  onSave: (data: CreateTemplateRequest) => Promise<void>;
}

const TemplateFormDialog: React.FC<TemplateFormDialogProps> = ({
  open,
  onOpenChange,
  template,
  onSave,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const buildDefault = useCallback((): FormData => {
    if (template) {
      return {
        name: template.name,
        position: template.position,
        type: template.type,
        dimensions: template.dimensions.map((dim) => ({
          name: dim.name,
          weight: dim.weight,
          indicators: dim.indicators.map((ind) => ({
            content: ind.content,
            description: ind.description,
            algorithm: ind.algorithm,
            dataSource: ind.dataSource,
            weight: ind.weight,
          })),
        })),
      };
    }
    return {
      name: '',
      position: '',
      type: 'monthly',
      dimensions: [
        {
          name: '',
          weight: 0,
          indicators: [
            {
              content: '',
              description: '',
              algorithm: '',
              dataSource: '',
              weight: 0,
            },
          ],
        },
      ],
    };
  }, [template]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefault(),
  });

  const { fields: dimFields, append: appendDim, remove: removeDim } =
    useFieldArray({ control: form.control, name: 'dimensions' });

  const [collapsedDims, setCollapsedDims] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (open) {
      form.reset(buildDefault());
      setCollapsedDims({});
    }
  }, [open, form, buildDefault]);

  const handleSubmit = async (data: FormData) => {
    const weightSum: number = data.dimensions.reduce(
      (sum: number, d) => sum + d.weight,
      0,
    );
    if (Math.abs(weightSum - 1) > 0.001) {
      toast.error(`维度权重之和必须等于 1，当前为 ${weightSum.toFixed(2)}`);
      return;
    }

    let totalMaxScore = 0;
    for (const dim of data.dimensions) {
      for (const ind of dim.indicators) {
        totalMaxScore += ind.weight;
      }
    }
    if (totalMaxScore !== 100) {
      toast.error(`所有指标满分之和必须为 100，当前为 ${totalMaxScore}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateTemplateRequest = {
        name: data.name,
        position: data.position,
        type: data.type,
        dimensions: data.dimensions.map((dim) => ({
          name: dim.name,
          weight: dim.weight,
          indicators: dim.indicators.map((ind) => ({
            content: ind.content,
            description: ind.description,
            algorithm: ind.algorithm,
            dataSource: ind.dataSource,
            weight: ind.weight,
          })),
        })),
      };
      await onSave(payload);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      logger.error('TemplateFormDialog save error:', msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const watchedDims = form.watch('dimensions');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-6"
          >
            <h2 className="text-lg font-semibold">
              {template ? '编辑考核模板' : '新建考核模板'}
            </h2>

            <div className="flex flex-wrap gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[200px]">
                    <FormLabel>
                      模板名称 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="如：销售经理月度考核" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[200px]">
                    <FormLabel>
                      适用岗位 <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择岗位" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {POSITION_OPTIONS.map((pos: string) => (
                          <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="w-[160px]">
                    <FormLabel>
                      考核类型 <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">月度考核</SelectItem>
                        <SelectItem value="probation">试用期考核</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium">考核维度</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendDim({
                      name: '',
                      weight: 0,
                      indicators: [
                        {
                          content: '',
                          description: '',
                          algorithm: '',
                          dataSource: '',
                          weight: 0,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="size-4 mr-1" />
                  添加维度
                </Button>
              </div>

              {dimFields.map((dimField, dimIdx: number) => {
                const collapsed = collapsedDims[dimIdx];
                const dimData = watchedDims?.[dimIdx];

                return (
                  <div
                    key={dimField.id}
                    className="rounded-md border p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          setCollapsedDims((prev: Record<number, boolean>) => ({
                            ...prev,
                            [dimIdx]: !prev[dimIdx],
                          }))
                        }
                      >
                        {collapsed ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronUp className="size-4" />
                        )}
                      </Button>
                      <span className="text-sm font-medium text-muted-foreground">
                        维度 {dimIdx + 1}
                      </span>
                      {dimFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="ml-auto text-destructive"
                          onClick={() => removeDim(dimIdx)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>

                    {!collapsed && (
                      <>
                        <div className="flex flex-wrap gap-4">
                          <FormField
                            control={form.control}
                            name={`dimensions.${dimIdx}.name`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormLabel>维度名称</FormLabel>
                                <FormControl>
                                  <Input placeholder="如：业绩指标" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`dimensions.${dimIdx}.weight`}
                            render={({ field }) => (
                              <FormItem className="w-[120px]">
                                <FormLabel>权重 (0-1)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    placeholder="0.3"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <IndicatorsFieldArray
                          control={form.control}
                          dimIdx={dimIdx}
                        />

                        {dimData && (
                          <div className="text-xs text-muted-foreground">
                            维度权重：{dimData.weight || 0}
                            {' | '}
                            指标满分合计：
                            {dimData.indicators?.reduce(
              (sum: number, i: { weight: number }) =>
                sum + (i.weight || 0),
                              0,
                            ) || 0}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : '保存'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateFormDialog;
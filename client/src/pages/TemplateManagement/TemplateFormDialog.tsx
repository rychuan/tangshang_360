import React, { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { handleApiError } from '@client/src/utils/api-error';
import {
  validateTotalWeight,
  validateIndicatorWeights,
} from '@client/src/utils/weight-validation';
import IndicatorsFieldArray from './TemplateIndicatorFields';
import { formSchema, type FormData } from './TemplateFormDialog.types';
import type {
  AssessmentTemplateDetail,
  CreateTemplateRequest,
} from '@shared/api.interface';

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AssessmentTemplateDetail | null;
  onSave: (data: CreateTemplateRequest) => Promise<void>;
  positions?: string[];
}

const TemplateFormDialog: React.FC<TemplateFormDialogProps> = ({
  open,
  onOpenChange,
  template,
  onSave,
  positions = [],
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

  const {
    fields: dimFields,
    append: appendDim,
    remove: removeDim,
  } = useFieldArray({ control: form.control, name: 'dimensions' });

  const [collapsedDims, setCollapsedDims] = useState<Record<number, boolean>>(
    {},
  );

  useEffect(() => {
    if (open) {
      form.reset(buildDefault());
      setCollapsedDims({});
    }
  }, [open, form, buildDefault]);

  const handleSubmit = async (data: FormData) => {
    const totalWeightResult = validateTotalWeight(data.dimensions);
    if (!totalWeightResult.isValid) {
      toast.error(
        `维度权重之和必须等于 100，当前为 ${totalWeightResult.totalWeight}`,
      );
      return;
    }

    const indicatorResult = validateIndicatorWeights(data.dimensions);
    if (!indicatorResult.isValid) {
      const err = indicatorResult.errors[0];
      toast.error(
        `维度「${err.dimensionName}」的指标权重之和必须等于维度权重 ${err.dimensionWeight}，当前为 ${err.indicatorSum}`,
      );
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
      logger.error('TemplateFormDialog save error:', err);
      handleApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const watchedDims = form.watch('dimensions');

  const totalDimWeight: number =
    watchedDims?.reduce((sum: number, d) => sum + (d?.weight || 0), 0) || 0;
  const dimWeightValid: boolean = Math.abs(totalDimWeight - 100) < 0.01;

  const indicatorWeightsValid: boolean =
    watchedDims?.every((dim) => {
      const indSum: number =
        dim?.indicators?.reduce(
          (sum: number, ind) => sum + (ind?.weight || 0),
          0,
        ) || 0;
      return Math.abs(indSum - (dim?.weight || 0)) < 0.01;
    }) ?? false;

  const canSubmit: boolean = dimWeightValid && indicatorWeightsValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col gap-6"
          >
            <DialogHeader>
              <DialogTitle>
                {template ? '编辑绩效模板' : '新建绩效模板'}
              </DialogTitle>
            </DialogHeader>

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
                      <Input placeholder="如：销售经理月度绩效" {...field} />
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
                        {positions.map((pos: string) => (
                          <SelectItem key={pos} value={pos}>
                            {pos}
                          </SelectItem>
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
                      绩效类型 <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">月度绩效</SelectItem>
                        <SelectItem value="probation">试用期绩效</SelectItem>
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
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-medium">绩效维度</h3>
                  <span
                    className={`text-sm font-medium ${dimWeightValid ? 'text-green-600' : 'text-destructive'}`}
                  >
                    维度权重总和：{totalDimWeight} / 100
                    {!dimWeightValid && ' （必须等于100）'}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
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
                    className="rounded-md border border-gray-300 bg-gray-400/20 p-4 flex flex-col gap-3 dark:border-gray-600 dark:bg-gray-800 [&_input]:border-gray-300 [&_textarea]:border-gray-300 [&_[data-slot=select-trigger]]:border-gray-300 dark:[&_input]:border-gray-600 dark:[&_textarea]:border-gray-600 dark:[&_[data-slot=select-trigger]]:border-gray-600"
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
                                  <Input
                                    placeholder="如：业绩指标"
                                    {...field}
                                  />
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
                                <FormLabel>权重 (%)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    max="100"
                                    placeholder="60"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(
                                        parseInt(e.target.value, 10) || 0,
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

                        {dimData &&
                          (() => {
                            const indSum: number =
                              dimData.indicators?.reduce(
                                (sum: number, i: { weight: number }) =>
                                  sum + (i.weight || 0),
                                0,
                              ) || 0;
                            const indValid: boolean =
                              Math.abs(indSum - (dimData.weight || 0)) < 0.01;
                            return (
                              <div
                                className={`text-xs font-medium ${indValid ? 'text-green-600' : 'text-destructive'}`}
                              >
                                指标权重总和：{indSum} / {dimData.weight || 0}
                                {!indValid && ' （必须等于维度权重）'}
                              </div>
                            );
                          })()}
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
              <Button type="submit" disabled={submitting || !canSubmit}>
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

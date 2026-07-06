import React, { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Card, CardContent, CardHeader } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Spinner } from '@client/src/components/ui/spinner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import {
  validateTotalWeight,
  validateIndicatorWeights,
} from '@client/src/utils/weight-validation';
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

  useEffect(() => {
    if (open) {
      form.reset(buildDefault());
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
  const watchedName = form.watch('name');
  const watchedPosition = form.watch('position');
  const watchedType = form.watch('type');

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
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {watchedName || '新建绩效模板'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {watchedPosition || '未选择岗位'}
            </Badge>
            <Badge variant="outline">
              {watchedType === 'monthly' ? '月度绩效' : '试用期绩效'}
            </Badge>
          </div>

          {/* Basic info fields */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground block mb-1">
                模板名称 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="如：销售经理月度绩效"
                value={watchedName}
                onChange={(e) => form.setValue('name', e.target.value)}
              />
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-muted-foreground block mb-1">
                适用岗位 <span className="text-destructive">*</span>
              </label>
              <Select
                onValueChange={(v) => form.setValue('position', v)}
                value={watchedPosition}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择岗位" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((pos: string) => (
                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <label className="text-xs text-muted-foreground block mb-1">
                绩效类型 <span className="text-destructive">*</span>
              </label>
              <Select
                onValueChange={(v: 'monthly' | 'probation') =>
                  form.setValue('type', v)
                }
                value={watchedType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">月度绩效</SelectItem>
                  <SelectItem value="probation">试用期绩效</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dimension cards */}
          {dimFields.map((dimField, dimIdx: number) => {
            const dimData = watchedDims?.[dimIdx];
            const { fields: indFields, append: appendInd, remove: removeInd } =
              useFieldArray({
                control: form.control,
                name: `dimensions.${dimIdx}.indicators`,
              });
            const indSum: number =
              dimData?.indicators?.reduce(
                (s: number, i: { weight: number }) => s + (i.weight || 0),
                0,
              ) || 0;
            const indValid: boolean =
              Math.abs(indSum - (dimData?.weight || 0)) < 0.01;

            return (
              <Card key={dimField.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="维度名称"
                      className="flex-1 text-base font-semibold h-8"
                      value={dimData?.name || ''}
                      onChange={(e) =>
                        form.setValue(
                          `dimensions.${dimIdx}.name`,
                          e.target.value,
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="权重"
                      className="w-16 h-8 text-center"
                      value={dimData?.weight || ''}
                      onChange={(e) =>
                        form.setValue(
                          `dimensions.${dimIdx}.weight`,
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Badge variant="secondary" className="text-xs">
                      权重 {dimData?.weight || 0}%
                    </Badge>
                    {dimFields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeDim(dimIdx)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[120px] text-xs">
                          指标 <span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="w-[140px] hidden md:table-cell text-xs">
                          说明
                        </TableHead>
                        <TableHead className="w-[120px] hidden lg:table-cell text-xs">
                          算法/描述
                        </TableHead>
                        <TableHead className="w-[100px] hidden lg:table-cell text-xs">
                          数据来源
                        </TableHead>
                        <TableHead className="text-center w-[60px] text-xs">
                          权重
                        </TableHead>
                        <TableHead className="w-[40px] text-xs" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {indFields.map((indField, indIdx: number) => (
                        <TableRow key={indField.id}>
                          <TableCell className="p-1">
                            <Input
                              className="h-8 text-xs"
                              placeholder="指标名称"
                              value={
                                form.watch(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.content`,
                                ) || ''
                              }
                              onChange={(e) =>
                                form.setValue(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.content`,
                                  e.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="p-1 hidden md:table-cell">
                            <Input
                              className="h-8 text-xs"
                              placeholder="说明"
                              value={
                                form.watch(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.description`,
                                ) || ''
                              }
                              onChange={(e) =>
                                form.setValue(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.description`,
                                  e.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="p-1 hidden lg:table-cell">
                            <Input
                              className="h-8 text-xs"
                              placeholder="算法"
                              value={
                                form.watch(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.algorithm`,
                                ) || ''
                              }
                              onChange={(e) =>
                                form.setValue(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.algorithm`,
                                  e.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="p-1 hidden lg:table-cell">
                            <Input
                              className="h-8 text-xs"
                              placeholder="数据来源"
                              value={
                                form.watch(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.dataSource`,
                                ) || ''
                              }
                              onChange={(e) =>
                                form.setValue(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.dataSource`,
                                  e.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="p-1 text-center">
                            <Input
                              type="number"
                              min="0"
                              className="h-8 w-14 text-xs text-center mx-auto"
                              placeholder="0"
                              value={
                                form.watch(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.weight`,
                                ) || ''
                              }
                              onChange={(e) =>
                                form.setValue(
                                  `dimensions.${dimIdx}.indicators.${indIdx}.weight`,
                                  parseInt(e.target.value, 10) || 0,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            {indFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive size-7"
                                onClick={() => removeInd(indIdx)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`text-xs font-medium ${indValid ? 'text-success' : 'text-destructive'}`}
                    >
                      指标权重总和：{indSum} / {dimData?.weight || 0}
                      {!indValid && ' （必须等于维度权重）'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        appendInd({
                          content: '',
                          description: '',
                          algorithm: '',
                          dataSource: '',
                          weight: 0,
                        })
                      }
                    >
                      <Plus className="size-3 mr-1" />
                      添加指标
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Bottom bar */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  appendDim({
                    name: '',
                    weight: 0,
                    indicators: [
                      { content: '', description: '', algorithm: '', dataSource: '', weight: 0 },
                    ],
                  })
                }
              >
                <Plus className="size-3 mr-1" />
                添加维度
              </Button>
              <span
                className={`text-sm font-medium ${dimWeightValid ? 'text-success' : 'text-destructive'}`}
              >
                维度权重总和：{totalDimWeight} / 100
                {!dimWeightValid && ' （必须等于100）'}
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                onClick={form.handleSubmit(handleSubmit)}
                disabled={submitting || !canSubmit}
              >
                {submitting && <Spinner className="mr-2 size-4" />}
                保存
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateFormDialog;

import React, { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Spinner } from '@client/src/components/ui/spinner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import {
  validateTotalWeight,
  validateIndicatorWeights,
} from '@client/src/utils/weight-validation';
import { formSchema, type FormData } from './TemplateFormDialog.types';
import DimensionCard from './DimensionCard';
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
        `权重分总和必须等于 100，当前为 ${totalWeightResult.totalWeight}`,
      );
      return;
    }
    const indicatorResult = validateIndicatorWeights(data.dimensions);
    if (!indicatorResult.isValid) {
      const err = indicatorResult.errors[0];
      toast.error(
        `维度「${err.dimensionName}」的权重分总和必须等于维度权重分 ${err.dimensionWeight}，当前为 ${err.indicatorSum}`,
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
          <DialogTitle>{watchedName || '新建绩效模板'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{watchedPosition || '未选择岗位'}</Badge>
            <Badge variant="outline">
              {watchedType === 'monthly' ? '月度绩效' : '试用期绩效'}
            </Badge>
          </div>

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
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
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

          {dimFields.map((dimField, dimIdx: number) => (
            <DimensionCard
              key={dimField.id}
              form={form}
              dimIdx={dimIdx}
              dimData={watchedDims?.[dimIdx]}
              onRemove={() => removeDim(dimIdx)}
              canRemove={dimFields.length > 1}
            />
          ))}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3">
              <Button
                type="button"
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
                <Plus className="size-3 mr-1" />
                添加维度
              </Button>
              <span
                className={`text-sm font-medium ${dimWeightValid ? 'text-success' : 'text-destructive'}`}
              >
                权重分总和：{totalDimWeight} / 100
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

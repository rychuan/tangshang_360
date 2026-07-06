import React from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import type { FormData } from './TemplateFormDialog.types';

interface DimensionCardProps {
  form: UseFormReturn<FormData>;
  dimIdx: number;
  dimData: FormData['dimensions'][number] | undefined;
  onRemove: () => void;
  canRemove: boolean;
}

const DimensionCard: React.FC<DimensionCardProps> = ({
  form,
  dimIdx,
  dimData,
  onRemove,
  canRemove,
}) => {
  const {
    fields: indFields,
    append: appendInd,
    remove: removeInd,
  } = useFieldArray({
    control: form.control,
    name: `dimensions.${dimIdx}.indicators`,
  });

  const indSum: number =
    dimData?.indicators?.reduce(
      (s: number, i: { weight: number }) => s + (i.weight || 0),
      0,
    ) || 0;
  const indValid: boolean = Math.abs(indSum - (dimData?.weight || 0)) < 0.01;

  return (
    <Card>
      <CardHeader className="pb-2 bg-muted">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground shrink-0">
            维度 {dimIdx + 1}：
          </span>
          <Input
            placeholder="维度名称"
            className="flex-1 text-sm font-semibold h-8"
            value={dimData?.name || ''}
            onChange={(e) =>
              form.setValue(`dimensions.${dimIdx}.name`, e.target.value)
            }
          />
          <span className="text-xs text-muted-foreground shrink-0">权重分</span>
          <Input
            type="number"
            min="0"
            max="100"
            placeholder="0"
            className="w-20 h-8 text-center text-sm"
            value={dimData?.weight || ''}
            onChange={(e) =>
              form.setValue(
                `dimensions.${dimIdx}.weight`,
                parseInt(e.target.value, 10) || 0,
              )
            }
          />
          <span className="text-xs text-muted-foreground">%</span>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={onRemove}
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
              <TableHead className="text-center w-[80px] text-xs">
                权重分
              </TableHead>
              <TableHead className="w-[40px] text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {indFields.map((indField, indIdx: number) => (
              <TableRow key={indField.id}>
                <TableCell className="p-1">
                  <Textarea
                    className="text-xs min-h-[32px] resize-none"
                    rows={2}
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
                  <Textarea
                    className="text-xs min-h-[32px] resize-none"
                    rows={2}
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
                  <Textarea
                    className="text-xs min-h-[32px] resize-none"
                    rows={2}
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
                    className="h-8 w-20 text-xs text-center mx-auto"
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
            权重分总和：{indSum} / {dimData?.weight || 0}
            {!indValid && ' （必须等于维度权重分）'}
          </span>
          <Button
            type="button"
            size="sm"
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
};

export default DimensionCard;

import React from 'react';
import { useFieldArray, type Control } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@client/src/components/ui/form';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import type { FormData } from './TemplateFormDialog.types';

interface IndicatorsFieldArrayProps {
  control: Control<FormData>;
  dimIdx: number;
}

const IndicatorsFieldArray: React.FC<IndicatorsFieldArrayProps> = ({
  control,
  dimIdx,
}) => {
  const {
    fields: indFields,
    append: appendInd,
    remove: removeInd,
  } = useFieldArray({
    control,
    name: `dimensions.${dimIdx}.indicators`,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">绩效指标</span>
        <Button
          type="button"
          variant="ghost"
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

      {indFields.map((indField, indIdx: number) => (
        <div
          key={indField.id}
          className="rounded-md border p-3 flex flex-col gap-3 bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              指标 {indIdx + 1}
            </span>
            {indFields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeInd(indIdx)}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>

          <FormField
            control={control}
            name={`dimensions.${dimIdx}.indicators.${indIdx}.content`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>指标</FormLabel>
                <FormControl>
                  <Input placeholder="如：月度销售额达标率" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={`dimensions.${dimIdx}.indicators.${indIdx}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>说明</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="描述该指标的绩效标准"
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-wrap gap-4">
            <FormField
              control={control}
              name={`dimensions.${dimIdx}.indicators.${indIdx}.algorithm`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>指标算法/描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="如：完成率*满分"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`dimensions.${dimIdx}.indicators.${indIdx}.dataSource`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>数据来源</FormLabel>
                  <FormControl>
                    <Input placeholder="如：CRM系统" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`dimensions.${dimIdx}.indicators.${indIdx}.weight`}
              render={({ field }) => (
                <FormItem className="w-[100px]">
                  <FormLabel>权重(%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="30"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default IndicatorsFieldArray;

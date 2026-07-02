import React, { useState, useMemo } from 'react';
import { CalendarIcon, X, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface MultiMonthPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiMonthPicker: React.FC<MultiMonthPickerProps> = ({
  value,
  onChange,
  placeholder = '选择周期',
  className,
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const currentYear: number = dayjs().year();

  const yearOptions: number[] = useMemo(() => {
    const arr: number[] = [];
    for (let y: number = currentYear + 1; y >= currentYear - 5; y--) {
      arr.push(y);
    }
    return arr;
  }, [currentYear]);

  const monthOptions: number[] = useMemo(
    () => Array.from({ length: 12 }, (_, i: number) => i + 1),
    [],
  );

  const [tempYear, setTempYear] = useState<string>(String(currentYear));
  const [tempMonth, setTempMonth] = useState<string>(String(dayjs().month() + 1));

  const handleAdd = (): void => {
    const period: string = `${tempYear}-${tempMonth.padStart(2, '0')}`;
    if (!value.includes(period)) {
      onChange([...value, period].sort().reverse());
    }
  };

  const handleRemove = (period: string): void => {
    onChange(value.filter((v: string) => v !== period));
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-start font-normal ${className ?? ''}`}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value.length > 0
            ? `已选 ${value.length} 个周期`
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">年</Label>
              <Select value={tempYear} onValueChange={setTempYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y: number) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">月</Label>
              <Select value={tempMonth} onValueChange={setTempMonth}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m: number) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-4" />
              添加
            </Button>
          </div>
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              {value.map((period: string) => (
                <Badge key={period} variant="secondary" className="gap-1">
                  {dayjs(period + '-01').format('YYYY年MM月')}
                  <button
                    type="button"
                    onClick={() => handleRemove(period)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiMonthPicker;

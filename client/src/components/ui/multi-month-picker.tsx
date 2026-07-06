import React, { useState, useMemo } from 'react';
import { CalendarIcon, X } from 'lucide-react';
import dayjs from 'dayjs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

const MultiMonthPicker: React.FC<MultiMonthPickerProps> = ({
  value,
  onChange,
  placeholder = '选择周期',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const currentYear = dayjs().year();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [tempMonths, setTempMonths] = useState<Set<number>>(new Set());

  const yearOptions: number[] = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const allSelected = tempMonths.size === 12;

  const toggleMonth = (m: number) => {
    setTempMonths((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  };

  const toggleAll = () => {
    setTempMonths(
      allSelected
        ? new Set()
        : new Set(Array.from({ length: 12 }, (_, i) => i + 1)),
    );
  };

  const handleConfirm = () => {
    const newPeriods: string[] = [];
    for (const m of tempMonths) {
      newPeriods.push(`${selectedYear}-${String(m).padStart(2, '0')}`);
    }
    const merged = [...new Set([...value, ...newPeriods])].sort().reverse();
    onChange(merged);
    setTempMonths(new Set());
  };

  const handleRemove = (period: string) => {
    onChange(value.filter((v) => v !== period));
  };

  const applyQuickSelect = (type: string) => {
    const now = dayjs();
    let periods: string[] = [];
    switch (type) {
      case 'this-month':
        periods = [now.format('YYYY-MM')];
        break;
      case 'last-month':
        periods = [now.subtract(1, 'month').format('YYYY-MM')];
        break;
      case 'this-quarter': {
        const qStart = now.startOf('quarter');
        for (let i = 0; i < 3; i++) {
          periods.push(qStart.add(i, 'month').format('YYYY-MM'));
        }
        break;
      }
      case 'this-year':
        for (let i = 0; i < 12; i++) {
          periods.push(now.startOf('year').add(i, 'month').format('YYYY-MM'));
        }
        break;
    }
    onChange([...new Set([...value, ...periods])].sort().reverse());
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTempMonths(new Set());
      setSelectedYear(String(currentYear));
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-start font-normal gap-1 ${className ?? ''}`}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="truncate">
            {value.length > 0 ? `已选 ${value.length} 个周期` : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b">
            {value.map((period) => (
              <Badge key={period} variant="secondary" className="gap-1 pr-1">
                {dayjs(period + '-01').format('YYYY年MM月')}
                <button
                  type="button"
                  onClick={() => handleRemove(period)}
                  className="ml-0.5 hover:text-destructive rounded-full"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-destructive ml-1"
            >
              清空
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">快速选择</Label>
            <Select onValueChange={(v) => { applyQuickSelect(v); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择预设周期..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this-month">本月</SelectItem>
                <SelectItem value="last-month">上月</SelectItem>
                <SelectItem value="this-quarter">本季度</SelectItem>
                <SelectItem value="this-year">本年</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">自定义年份</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              月份 ({tempMonths.size}/12)
            </Label>
            <div className="flex items-center gap-2 mt-1 mb-2">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <span className="text-xs text-muted-foreground">全选</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_LABELS.map((label, i) => {
                const m = i + 1;
                const checked = tempMonths.has(m);
                return (
                  <label
                    key={m}
                    className={`flex items-center gap-1.5 rounded px-1.5 py-1 cursor-pointer text-xs transition-colors ${
                      checked
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleMonth(m)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={tempMonths.size === 0}
          >
            添加选中月份
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiMonthPicker;

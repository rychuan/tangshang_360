import React, { useState, useMemo, useEffect } from 'react';
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

const QUICK_OPTIONS = [
  { key: 'this-month', label: '本月' },
  { key: 'last-month', label: '上月' },
  { key: 'this-quarter', label: '本季度' },
  { key: 'this-year', label: '本年' },
] as const;

interface MultiMonthPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  single?: boolean; // 单选模式，只保留最后一个值
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

function periodsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join(',') === [...b].sort().join(',');
}

const MultiMonthPicker: React.FC<MultiMonthPickerProps> = ({
  value,
  onChange,
  placeholder = '自定义',
  className,
  single,
}) => {
  const [open, setOpen] = useState(false);
  const currentYear = dayjs().year();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [tempMonths, setTempMonths] = useState<Set<number>>(new Set());
  const [activeQuick, setActiveQuick] = useState<string>('');

  const yearOptions: number[] = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const allSelected = tempMonths.size === 12;
  const toggleMonth = (m: number) =>
    setTempMonths((prev) => {
      const n = new Set(prev);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });
  const toggleAll = () =>
    setTempMonths(
      allSelected
        ? new Set()
        : new Set(Array.from({ length: 12 }, (_, i) => i + 1)),
    );

  const quickPeriods = (type: string): string[] => {
    const now = dayjs();
    switch (type) {
      case 'this-month':
        return [now.format('YYYY-MM')];
      case 'last-month':
        return [now.subtract(1, 'month').format('YYYY-MM')];
      case 'this-quarter': {
        const p: string[] = [];
        const m = now.month();
        const qs = Math.floor(m / 3) * 3;
        for (let i = 0; i < 3; i++)
          p.push(
            now
              .month(qs + i)
              .date(1)
              .format('YYYY-MM'),
          );
        return p;
      }
      case 'this-year': {
        const p: string[] = [];
        for (let i = 0; i < 12; i++)
          p.push(now.startOf('year').add(i, 'month').format('YYYY-MM'));
        return p;
      }
      default:
        return [];
    }
  };

  const handleQuick = (key: string) => {
    const periods = quickPeriods(key);
    onChange(single ? [periods[periods.length - 1]] : periods.sort().reverse());
    setActiveQuick(key);
  };

  const handleSingleMonth = (month: number) => {
    const period = `${selectedYear}-${String(month).padStart(2, '0')}`;
    onChange([period]);
    setOpen(false);
  };

  const handleConfirm = () => {
    const newPeriods: string[] = [];
    for (const m of tempMonths)
      newPeriods.push(`${selectedYear}-${String(m).padStart(2, '0')}`);
    onChange([...new Set([...value, ...newPeriods])].sort().reverse());
    setTempMonths(new Set());
    setActiveQuick('');
  };

  const handleRemove = (period: string) => {
    onChange(value.filter((v) => v !== period));
    setActiveQuick('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTempMonths(new Set());
      setSelectedYear(String(currentYear));
    }
  };

  // 检测当前值是否匹配某个快捷选项，自动高亮
  useEffect(() => {
    let matched = '';
    for (const opt of QUICK_OPTIONS) {
      if (periodsMatch(value, quickPeriods(opt.key))) {
        matched = opt.key;
        break;
      }
    }
    setActiveQuick(matched);
  }, [value]);

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      {!single &&
        QUICK_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant={activeQuick === opt.key ? 'default' : 'outline'}
            onClick={() => handleQuick(opt.key)}
            className="h-8 text-xs"
          >
            {opt.label}
          </Button>
        ))}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={!single && activeQuick ? 'outline' : 'default'}
            className={`h-8 gap-1 text-xs ${single || !activeQuick ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
          >
            <CalendarIcon className="size-3.5" />
            {single
              ? (value[0] ? dayjs(value[0] + '-01').format('YYYY年MM月') : placeholder)
              : (value.length > 0 ? `${value.length}个周期` : placeholder)}
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
                onClick={() => {
                  onChange([]);
                  setActiveQuick('');
                }}
                className="text-xs text-muted-foreground hover:text-destructive ml-1"
              >
                清空
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">年份</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
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
              {!single && <div className="flex items-center gap-2 mt-1 mb-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span className="text-xs text-muted-foreground">全选</span>
              </div>}
              <div className="grid grid-cols-4 gap-1.5">
                {MONTH_LABELS.map((label, i) => {
                  const m = i + 1;
                  const checked = tempMonths.has(m);
                  return (
                    <label
                      key={m}
                      className={`flex items-center gap-1.5 rounded px-1.5 py-1 cursor-pointer text-xs transition-colors ${checked ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => single ? handleSingleMonth(m) : toggleMonth(m)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
            {!single && (
              <Button size="sm" onClick={handleConfirm} disabled={tempMonths.size === 0}>
                添加选中月份
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default MultiMonthPicker;

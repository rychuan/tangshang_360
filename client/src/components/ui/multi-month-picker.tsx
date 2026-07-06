import React, { useState, useMemo } from 'react';
import { CalendarIcon, X, ChevronDown, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface MultiMonthPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const MultiMonthPicker: React.FC<MultiMonthPickerProps> = ({
  value,
  onChange,
  placeholder = '选择周期',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const currentYear = dayjs().year();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const yearOptions: number[] = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const togglePeriod = (period: string) => {
    if (value.includes(period)) {
      onChange(value.filter((v) => v !== period));
    } else {
      onChange([...value, period].sort().reverse());
    }
  };

  const toggleYear = (year: number) => {
    const yearPeriods = MONTHS.map((m) => `${year}-${String(m).padStart(2, '0')}`);
    const allSelected = yearPeriods.every((p) => value.includes(p));
    if (allSelected) {
      onChange(value.filter((v) => !yearPeriods.includes(v)));
    } else {
      onChange([...new Set([...value, ...yearPeriods])].sort().reverse());
    }
  };

  const getYearStats = (year: number) => {
    const count = MONTHS.filter((m) =>
      value.includes(`${year}-${String(m).padStart(2, '0')}`),
    ).length;
    return { count, all: count === 12 };
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-start font-normal gap-1 ${className ?? ''}`}>
          <CalendarIcon className="size-4 shrink-0" />
          <span className="truncate">
            {value.length > 0 ? `已选 ${value.length} 个周期` : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-4" align="start">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b">
            {value.map((period) => (
              <Badge key={period} variant="secondary" className="gap-1 pr-1">
                {dayjs(period + '-01').format('YYYY年MM月')}
                <button
                  type="button"
                  onClick={() => togglePeriod(period)}
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
              清空全部
            </button>
          </div>
        )}
        <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
          {yearOptions.map((year) => {
            const { count, all } = getYearStats(year);
            const isCollapsed = collapsed[year];
            return (
              <div key={year} className="rounded-md border">
                <button
                  type="button"
                  onClick={() => setCollapsed((p) => ({ ...p, [year]: !p[year] }))}
                  className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 rounded-t-md"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    <span className="text-sm font-medium">{year}年</span>
                    <span className="text-xs text-muted-foreground">({count}/12)</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={all} onCheckedChange={() => toggleYear(year)} />
                    <span className="text-xs text-muted-foreground">全选</span>
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
                    {MONTHS.map((m, i) => {
                      const period = `${year}-${String(m).padStart(2, '0')}`;
                      const checked = value.includes(period);
                      return (
                        <label
                          key={m}
                          className={`flex items-center gap-1.5 rounded px-1.5 py-1 cursor-pointer text-xs transition-colors ${
                            checked ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => togglePeriod(period)} />
                          {MONTH_LABELS[i]}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiMonthPicker;

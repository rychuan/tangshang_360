import React, { useState, useMemo } from 'react';
import { CalendarIcon } from '@/components/ui/hugeicons';
import dayjs from 'dayjs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const MonthPicker: React.FC<MonthPickerProps> = ({ value, onChange }) => {
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

  const initial: dayjs.Dayjs = value ? dayjs(value + '-01') : dayjs();
  const [tempYear, setTempYear] = useState<string>(String(initial.year()));
  const [tempMonth, setTempMonth] = useState<string>(
    String(initial.month() + 1),
  );

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      const base: dayjs.Dayjs = value ? dayjs(value + '-01') : dayjs();
      setTempYear(String(base.year()));
      setTempMonth(String(base.month() + 1));
    }
    setOpen(next);
  };

  const handleMonthChange = (m: string): void => {
    setTempMonth(m);
    onChange(`${tempYear}-${m.padStart(2, '0')}`);
    setOpen(false);
  };

  const handleYearChange = (y: string): void => {
    setTempYear(y);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-48 justify-start text-left font-normal"
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? dayjs(value + '-01').format('YYYY年MM月') : '选择周期'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">年</Label>
            <Select value={tempYear} onValueChange={handleYearChange}>
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
            <Select value={tempMonth} onValueChange={handleMonthChange}>
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
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MonthPicker;

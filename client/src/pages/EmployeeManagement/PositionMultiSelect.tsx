import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, X } from '@/components/ui/hugeicons';

export interface PositionMultiSelectProps {
  positions: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}

const PositionMultiSelect: React.FC<PositionMultiSelectProps> = ({
  positions,
  value,
  onChange,
  placeholder = '全部岗位',
  className,
}) => {
  const [open, setOpen] = useState(false);

  const toggle = (pos: string): void => {
    if (value.includes(pos)) {
      onChange(value.filter((v) => v !== pos));
    } else {
      onChange([...value, pos]);
    }
  };

  const removeOne = (pos: string): void => {
    onChange(value.filter((v) => v !== pos));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`justify-between font-normal ${className ?? ''}`}
        >
          <div className="flex flex-wrap items-center gap-1 overflow-hidden">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map((pos) => (
                <Badge
                  key={pos}
                  variant="secondary"
                  className="flex items-center gap-0.5 text-xs"
                >
                  {pos}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOne(pos);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        removeOne(pos);
                      }
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-1" align="start">
        {positions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            暂无岗位数据
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            {positions.map((pos) => (
              <label
                key={pos}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  checked={value.includes(pos)}
                  onCheckedChange={() => toggle(pos)}
                />
                <span className="truncate">{pos}</span>
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default PositionMultiSelect;

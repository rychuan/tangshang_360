import React, { useState } from 'react';
import { Check, ChevronDown } from '@/components/ui/hugeicons';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  className,
}) => {
  const [open, setOpen] = useState<boolean>(false);

  const toggle = (val: string): void => {
    if (value.includes(val)) {
      onChange(value.filter((v: string) => v !== val));
    } else {
      onChange([...value, val]);
    }
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
          <span className={value.length > 0 ? '' : 'text-muted-foreground'}>
            {value.length > 0 ? `已选 ${value.length} 项` : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1" align="start">
        <div className="max-h-64 overflow-y-auto">
          {options.map((opt: MultiSelectOption) => {
            const isSelected: boolean = value.includes(opt.value);
            return (
              <div
                key={opt.value}
                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
                onClick={() => toggle(opt.value)}
              >
                <div
                  className={`flex size-4 items-center justify-center rounded border ${isSelected ? 'border-primary bg-primary' : 'border-input'}`}
                >
                  {isSelected && <Check className="size-3 text-primary-foreground" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </div>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="mt-1 border-t pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onChange([])}
            >
              清空选择
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelect;

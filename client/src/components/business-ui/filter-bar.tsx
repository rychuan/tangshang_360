import React from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// FilterBar — consistent filter area wrapper
// ---------------------------------------------------------------------------

interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {}

const FilterBar: React.FC<FilterBarProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      role="search"
      className={cn('flex flex-wrap items-center gap-3', className)}
      {...props}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FilterBarActions — consistent search/reset button group
// ---------------------------------------------------------------------------

interface FilterBarActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

const FilterBarActions: React.FC<FilterBarActionsProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  );
};

export { FilterBar, FilterBarActions };
export type { FilterBarProps, FilterBarActionsProps };

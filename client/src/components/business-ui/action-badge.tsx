import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ActionType =
  | 'edit'
  | 'delete'
  | 'unbind'
  | 'deactivate'
  | 'view'
  | 'history'
  | 'preview'
  | 'toggle'
  | 'bind';

const VARIANT_MAP: Record<
  ActionType,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  edit: 'default',
  delete: 'destructive',
  unbind: 'destructive',
  deactivate: 'destructive',
  view: 'secondary',
  history: 'secondary',
  preview: 'secondary',
  toggle: 'outline',
  bind: 'outline',
};

interface ActionBadgeProps {
  actionType: ActionType;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ActionBadge({
  actionType,
  label,
  icon,
  onClick,
  disabled = false,
  className,
}: ActionBadgeProps) {
  const variant = VARIANT_MAP[actionType] ?? 'secondary';

  return (
    <Badge
      variant={variant}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        'cursor-pointer select-none hover:opacity-80 transition-opacity',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      onClick={disabled ? undefined : onClick}
    >
      {icon && <span className="mr-1 inline-flex">{icon}</span>}
      {label}
    </Badge>
  );
}

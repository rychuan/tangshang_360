'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  XIcon,
} from '@/components/ui/hugeicons';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ className, style, icons, ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className={cn('toaster group', className)}
      position="top-center"
      closeButton
      duration={3000}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <CircleAlertIcon className="size-4 text-warning" />,
        error: <CircleXIcon className="size-4 text-destructive" />,
        close: <XIcon className="size-4 text-muted-foreground" />,
        loading: <Loader2Icon className="size-4 animate-spin text-primary" />,
        ...icons,
      }}
      toastOptions={{
        success: { style: { background: 'hsl(var(--success) / 0.08)' } },
        error: { style: { background: 'hsl(var(--destructive) / 0.08)' } },
        warning: { style: { background: 'hsl(var(--warning) / 0.08)' } },
        info: { style: { background: 'hsl(var(--info) / 0.08)' } },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };

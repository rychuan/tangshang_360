import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  visuallyHidden?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  visuallyHidden = false,
}) => {
  const heading = (
    <h1
      className={`flex items-center gap-2 text-2xl font-semibold tracking-tight ${
        visuallyHidden ? 'hidden' : ''
      }`}
    >
      {Icon && <Icon className="size-5 shrink-0" />}
      {title}
    </h1>
  );

  if (!description && !actions) {
    return heading;
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div>
        {heading}
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};

export { PageHeader };
export type { PageHeaderProps };

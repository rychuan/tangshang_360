import React from 'react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Unified assessment status labels & badge variants
// ---------------------------------------------------------------------------

export const ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  self_review: '自评中',
  supervisor_review: '上级评分中',
  pending_sign: '待签名',
  completed: '已完成',
};

export const ASSESSMENT_STATUS_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  self_review: 'default',
  supervisor_review: 'default',
  pending_sign: 'outline',
  completed: 'outline',
};

// ---------------------------------------------------------------------------
// Unified grade labels & badge variants
// ---------------------------------------------------------------------------

export const GRADE_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  S: 'default',
  A: 'default',
  B: 'secondary',
  C: 'outline',
  D: 'destructive',
};

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const label = ASSESSMENT_STATUS_LABELS[status] ?? status;
  const variant = ASSESSMENT_STATUS_BADGE_VARIANT[status] ?? 'secondary';
  const completedClass =
    status === 'completed'
      ? 'bg-success/10 text-success border-success/20'
      : '';
  return (
    <Badge variant={variant} className={`${completedClass} ${className ?? ''}`}>
      {label}
    </Badge>
  );
};

// ---------------------------------------------------------------------------
// GradeBadge
// ---------------------------------------------------------------------------

interface GradeBadgeProps {
  grade: string;
  className?: string;
}

const GradeBadge: React.FC<GradeBadgeProps> = ({ grade, className }) => {
  if (!grade) return null;
  const label = grade;
  const variant = GRADE_BADGE_VARIANT[grade] ?? 'secondary';
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
};

export { StatusBadge, GradeBadge };
export type { StatusBadgeProps, GradeBadgeProps };

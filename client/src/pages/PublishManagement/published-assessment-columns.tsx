export const PUBLISHED_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  self_review: '自评中',
  supervisor_review: '上级评分中',
  pending_sign: '待签名',
  completed: '已完成',
};

export const PUBLISHED_STATUS_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  self_review: 'secondary',
  supervisor_review: 'default',
  pending_sign: 'default',
  completed: 'secondary',
};

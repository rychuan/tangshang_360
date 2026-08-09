/** 发布状态分组：前端筛选用的「进行中」分组 → 具体实例状态集合 */
const PUBLISHED_ASSESSMENT_STATUS_GROUPS: Record<string, string[]> = {
  employee_processing: ['self_review', 'pending_sign'],
  supervisor_processing: ['supervisor_review', 'supervisor_sign'],
};

export function getPublishedAssessmentStatuses(status: string): string[] {
  return PUBLISHED_ASSESSMENT_STATUS_GROUPS[status] ?? [status];
}

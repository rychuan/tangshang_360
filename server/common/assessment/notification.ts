import { BadRequestException } from '@nestjs/common';

export type AssessmentBusinessStatus =
  | 'employee_processing'
  | 'supervisor_processing'
  | 'completed';

export interface AssessmentNotificationInput {
  instanceId: string;
  period: string;
  employeeId: string;
  employeeName: string;
  supervisorId?: string | null;
  status: string;
  appBaseUrl: string;
}

export interface AssessmentNotificationMessage {
  receiverId: string;
  recipientRole: 'employee' | 'supervisor';
  title: string;
  markdown: string;
}

export interface ReminderPreviewSummary {
  taskCount: number;
  employeeCount: number;
  supervisorCount: number;
  expectedMessageCount: number;
  missingSupervisorCount: number;
}

const EMPLOYEE_PROCESSING_STATUSES = new Set(['self_review', 'pending_sign']);
const SUPERVISOR_PROCESSING_STATUSES = new Set([
  'supervisor_review',
  'supervisor_sign',
]);

export function getAssessmentBusinessStatus(
  status: string,
): AssessmentBusinessStatus {
  if (EMPLOYEE_PROCESSING_STATUSES.has(status)) {
    return 'employee_processing';
  }
  if (SUPERVISOR_PROCESSING_STATUSES.has(status)) {
    return 'supervisor_processing';
  }
  return 'completed';
}

export function getAssessmentBusinessStatusLabel(status: string): string {
  const businessStatus = getAssessmentBusinessStatus(status);
  if (businessStatus === 'employee_processing') return '员工处理中';
  if (businessStatus === 'supervisor_processing') return '上级处理中';
  return '已完成';
}

export function normalizeAppBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid application URL');
    }
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname === '/' ? '' : pathname}`;
  } catch {
    throw new BadRequestException('应用访问地址无效');
  }
}

export function buildAssessmentDetailUrl(
  appBaseUrl: string,
  instanceId: string,
  view: 'employee' | 'supervisor',
): string {
  const baseUrl = normalizeAppBaseUrl(appBaseUrl);
  const detailUrl = `${baseUrl}/assessment/${encodeURIComponent(instanceId)}`;
  return view === 'supervisor' ? `${detailUrl}?view=supervisor` : detailUrl;
}

function buildMessageHeader(
  input: AssessmentNotificationInput,
  statusLabel: string,
): string {
  return [
    `绩效周期：${input.period}`,
    `当前对象：${input.employeeName}`,
    `当前状态：${statusLabel}`,
  ].join('\n');
}

export function buildPublishedNotificationMessages(
  input: AssessmentNotificationInput,
): AssessmentNotificationMessage[] {
  const statusLabel = getAssessmentBusinessStatusLabel(input.status);
  const header = buildMessageHeader(input, statusLabel);
  const employeeUrl = buildAssessmentDetailUrl(
    input.appBaseUrl,
    input.instanceId,
    'employee',
  );
  const messages: AssessmentNotificationMessage[] = [
    {
      receiverId: input.employeeId,
      recipientRole: 'employee',
      title: '绩效任务发布通知',
      markdown: `**绩效任务已发布**\n\n${header}\n\n本月绩效任务已经发布，请完成本人评分和签名，并按时提交。\n\n[查看绩效详情](${employeeUrl})`,
    },
  ];

  if (input.supervisorId) {
    const supervisorUrl = buildAssessmentDetailUrl(
      input.appBaseUrl,
      input.instanceId,
      'supervisor',
    );
    messages.push({
      receiverId: input.supervisorId,
      recipientRole: 'supervisor',
      title: '绩效任务发布通知',
      markdown: `**绩效任务已发布**\n\n${header}\n\n请关注${input.employeeName}的处理进度，并在员工完成后及时完成上级评分和签名。\n\n[查看绩效详情](${supervisorUrl})`,
    });
  }

  return messages;
}

export function buildReminderNotificationMessages(
  input: AssessmentNotificationInput,
): AssessmentNotificationMessage[] {
  const businessStatus = getAssessmentBusinessStatus(input.status);
  if (businessStatus === 'completed') return [];

  const statusLabel = getAssessmentBusinessStatusLabel(input.status);
  const header = buildMessageHeader(input, statusLabel);
  const employeeUrl = buildAssessmentDetailUrl(
    input.appBaseUrl,
    input.instanceId,
    'employee',
  );
  const employeeAction =
    businessStatus === 'employee_processing'
      ? '请尽快完成本人评分和签名。'
      : '当前任务正在等待上级处理，请及时推动上级完成评分和签名。';
  const messages: AssessmentNotificationMessage[] = [
    {
      receiverId: input.employeeId,
      recipientRole: 'employee',
      title: '绩效任务催办提醒',
      markdown: `**绩效任务催办提醒**\n\n${header}\n\n${employeeAction}\n\n[查看绩效详情](${employeeUrl})`,
    },
  ];

  if (input.supervisorId) {
    const supervisorUrl = buildAssessmentDetailUrl(
      input.appBaseUrl,
      input.instanceId,
      'supervisor',
    );
    const supervisorAction =
      businessStatus === 'employee_processing'
        ? `请推动${input.employeeName}及时完成本人评分和签名。`
        : `请尽快完成上级评分和签名，当前对象为${input.employeeName}。`;
    messages.push({
      receiverId: input.supervisorId,
      recipientRole: 'supervisor',
      title: '绩效任务催办提醒',
      markdown: `**绩效任务催办提醒**\n\n${header}\n\n${supervisorAction}\n\n[查看绩效详情](${supervisorUrl})`,
    });
  }

  return messages;
}

export function summarizeReminderTargets(
  targets: Array<{
    employeeId: string;
    supervisorId?: string | null;
  }>,
): ReminderPreviewSummary {
  const employeeIds = new Set(targets.map((target) => target.employeeId));
  const supervisorIds = new Set(
    targets
      .map((target) => target.supervisorId)
      .filter((id): id is string => Boolean(id)),
  );
  const missingSupervisorCount = targets.filter(
    (target) => !target.supervisorId,
  ).length;

  return {
    taskCount: targets.length,
    employeeCount: employeeIds.size,
    supervisorCount: supervisorIds.size,
    expectedMessageCount: targets.length * 2 - missingSupervisorCount,
    missingSupervisorCount,
  };
}

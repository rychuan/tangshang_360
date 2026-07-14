import {
  buildAssessmentDetailUrl,
  buildPublishedNotificationMessages,
  buildReminderNotificationMessages,
  getAssessmentBusinessStatus,
  normalizeAppBaseUrl,
  summarizeReminderTargets,
} from '../../server/common/assessment/notification';

const baseInput = {
  instanceId: '2f37b790-4ef7-4d8d-b046-dde3869d9b87',
  period: '2026-07',
  employeeId: 'employee-1',
  employeeName: '张三',
  supervisorId: 'supervisor-1',
  status: 'self_review',
  appBaseUrl: 'https://example.com/app/app-1',
};

describe('assessment notification helpers', () => {
  it('groups persisted workflow states into business statuses', () => {
    expect(getAssessmentBusinessStatus('self_review')).toBe(
      'employee_processing',
    );
    expect(getAssessmentBusinessStatus('pending_sign')).toBe(
      'employee_processing',
    );
    expect(getAssessmentBusinessStatus('supervisor_review')).toBe(
      'supervisor_processing',
    );
    expect(getAssessmentBusinessStatus('supervisor_sign')).toBe(
      'supervisor_processing',
    );
    expect(getAssessmentBusinessStatus('completed')).toBe('completed');
  });

  it('normalizes valid application base URLs and rejects unsafe URLs', () => {
    expect(normalizeAppBaseUrl('https://example.com/app/app-1/')).toBe(
      'https://example.com/app/app-1',
    );
    expect(() => normalizeAppBaseUrl('javascript:alert(1)')).toThrow(
      '应用访问地址无效',
    );
    expect(() =>
      normalizeAppBaseUrl('https://user:pass@example.com/app/app-1'),
    ).toThrow('应用访问地址无效');
  });

  it('builds employee and supervisor detail links', () => {
    expect(
      buildAssessmentDetailUrl(
        baseInput.appBaseUrl,
        baseInput.instanceId,
        'employee',
      ),
    ).toBe(
      'https://example.com/app/app-1/assessment/2f37b790-4ef7-4d8d-b046-dde3869d9b87',
    );
    expect(
      buildAssessmentDetailUrl(
        baseInput.appBaseUrl,
        baseInput.instanceId,
        'supervisor',
      ),
    ).toBe(
      'https://example.com/app/app-1/assessment/2f37b790-4ef7-4d8d-b046-dde3869d9b87?view=supervisor',
    );
  });

  it('builds role-specific publish messages for employee and supervisor', () => {
    const messages = buildPublishedNotificationMessages(baseInput);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      receiverId: 'employee-1',
      recipientRole: 'employee',
      title: '绩效任务发布通知',
    });
    expect(messages[0].markdown).toContain('请完成本人评分和签名');
    expect(messages[1]).toMatchObject({
      receiverId: 'supervisor-1',
      recipientRole: 'supervisor',
    });
    expect(messages[1].markdown).toContain('请关注张三的处理进度');
  });

  it('builds two targeted reminders while employee processing is active', () => {
    const messages = buildReminderNotificationMessages(baseInput);

    expect(messages).toHaveLength(2);
    expect(messages[0].markdown).toContain('请尽快完成本人评分和签名');
    expect(messages[1].markdown).toContain('请推动张三及时完成');
    expect(messages[0].markdown).toContain('当前状态：员工处理中');
  });

  it('builds two targeted reminders while supervisor processing is active', () => {
    const messages = buildReminderNotificationMessages({
      ...baseInput,
      status: 'supervisor_review',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].markdown).toContain('请及时推动上级完成');
    expect(messages[1].markdown).toContain('请尽快完成上级评分和签名');
    expect(messages[1].markdown).toContain('当前状态：上级处理中');
  });

  it('does not remind completed assessments and tolerates missing supervisors', () => {
    expect(
      buildReminderNotificationMessages({
        ...baseInput,
        status: 'completed',
      }),
    ).toEqual([]);
    expect(
      buildPublishedNotificationMessages({
        ...baseInput,
        supervisorId: undefined,
      }),
    ).toHaveLength(1);
  });

  it('summarizes all reminder targets and missing supervisors', () => {
    expect(
      summarizeReminderTargets([
        { employeeId: 'employee-1', supervisorId: 'supervisor-1' },
        { employeeId: 'employee-2', supervisorId: 'supervisor-1' },
        { employeeId: 'employee-3', supervisorId: null },
      ]),
    ).toEqual({
      taskCount: 3,
      employeeCount: 3,
      supervisorCount: 1,
      expectedMessageCount: 5,
      missingSupervisorCount: 1,
    });
  });
});

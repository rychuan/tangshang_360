import { getPublishedAssessmentStatuses } from '../../server/modules/assessment-publish/assessment-publish.service';

describe('published assessment status filters', () => {
  it('groups employee rating and legacy signing states', () => {
    expect(getPublishedAssessmentStatuses('employee_processing')).toEqual([
      'self_review',
      'pending_sign',
    ]);
  });

  it('groups supervisor rating and legacy signing states', () => {
    expect(getPublishedAssessmentStatuses('supervisor_processing')).toEqual([
      'supervisor_review',
      'supervisor_sign',
    ]);
  });

  it('keeps exact persisted statuses compatible', () => {
    expect(getPublishedAssessmentStatuses('completed')).toEqual(['completed']);
    expect(getPublishedAssessmentStatuses('self_review')).toEqual([
      'self_review',
    ]);
  });
});

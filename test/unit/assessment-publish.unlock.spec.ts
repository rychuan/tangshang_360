import {
  getUnlockRule,
  getUnlockUpdateData,
} from '../../server/modules/assessment-publish/assessment-publish.service';

describe('assessment publish unlock rules', () => {
  it('resets both self and supervisor ratings when supervisor review is unlocked', () => {
    expect(getUnlockRule('supervisor_review')).toEqual({
      newStatus: 'self_review',
      resetRatingTypes: ['self', 'supervisor'],
    });
  });

  it('clears signatures when pending sign is unlocked', () => {
    expect(getUnlockUpdateData(getUnlockRule('pending_sign'))).toMatchObject({
      status: 'supervisor_review',
      totalScore: null,
      grade: null,
      selfSignName: null,
      selfSignAt: null,
      selfSignImage: null,
      supervisorSignName: null,
      supervisorSignAt: null,
      supervisorSignImage: null,
    });
  });
});

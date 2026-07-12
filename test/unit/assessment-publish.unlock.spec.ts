import {
  getUnlockRule,
  getUnlockUpdateData,
} from '../../server/modules/assessment-publish/assessment-publish.service';

describe('assessment publish unlock rules', () => {
  it('clears supervisor ratings when supervisor sign is unlocked', () => {
    expect(getUnlockRule('supervisor_sign')).toEqual({
      newStatus: 'supervisor_review',
      resetRatingTypes: ['supervisor'],
      clearSigns: 'supervisor',
    });
  });

  it('clears supervisor ratings when supervisor review is unlocked', () => {
    expect(getUnlockRule('supervisor_review')).toEqual({
      newStatus: 'pending_sign',
      resetRatingTypes: ['supervisor'],
    });
  });

  it('clears employee signature when pending sign is unlocked', () => {
    expect(getUnlockUpdateData(getUnlockRule('pending_sign'))).toMatchObject({
      status: 'self_review',
      totalScore: null,
      grade: null,
      completedAt: null,
      selfSignName: null,
      selfSignAt: null,
      selfSignImage: null,
    });
  });

  it('clears only supervisor signature and completed time when completed is unlocked', () => {
    const updateData = getUnlockUpdateData(getUnlockRule('completed'));

    expect(updateData).toMatchObject({
      status: 'supervisor_sign',
      completedAt: null,
      supervisorSignName: null,
      supervisorSignAt: null,
      supervisorSignImage: null,
    });
    expect(updateData).not.toHaveProperty('totalScore');
    expect(updateData).not.toHaveProperty('grade');
  });
});

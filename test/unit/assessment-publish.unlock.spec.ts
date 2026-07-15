import {
  getUnlockRule,
  getUnlockUpdateData,
} from '../../server/modules/assessment-publish/unlock.service';

describe('assessment publish unlock rules', () => {
  it('keeps legacy supervisor_sign unlock compatible', () => {
    expect(getUnlockRule('supervisor_sign')).toEqual({
      newStatus: 'supervisor_review',
      resetRatingTypes: ['supervisor'],
      clearSigns: 'supervisor',
    });
  });

  it('clears supervisor ratings when supervisor review is unlocked', () => {
    expect(getUnlockRule('supervisor_review')).toEqual({
      newStatus: 'self_review',
      clearSigns: 'self',
      draftRatingTypes: ['self'],
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

  it('clears supervisor result and signature when completed is unlocked', () => {
    const updateData = getUnlockUpdateData(getUnlockRule('completed'));

    expect(updateData).toMatchObject({
      status: 'supervisor_review',
      completedAt: null,
      totalScore: null,
      grade: null,
      supervisorSignName: null,
      supervisorSignAt: null,
      supervisorSignImage: null,
    });
  });

  it('keeps legacy supervisor_sign unlock at supervisor review', () => {
    expect(getUnlockRule('supervisor_sign')).toEqual({
      newStatus: 'supervisor_review',
      resetRatingTypes: ['supervisor'],
      clearSigns: 'supervisor',
    });
  });
});

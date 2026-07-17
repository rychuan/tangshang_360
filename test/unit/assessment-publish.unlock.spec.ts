import {
  getUnlockRule,
  getUnlockUpdateData,
  UnlockService,
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

  it('rejects an out-of-scope unlock before opening a mutation transaction', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ employeeId: 'employee-2' }]),
    };
    const db = {
      select: jest.fn().mockReturnValue(instanceQuery),
      transaction: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (UnlockService as any)(
      db,
      accessScopeService,
    ) as UnlockService;

    await expect(
      service.unlock(
        '11111111-1111-4111-8111-111111111111',
        { reason: '修正评分' },
        'manager-1',
      ),
    ).rejects.toThrow('无权操作该考核实例');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope batch unlock instead of returning a partial result', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          employeeId: 'employee-2',
        },
      ]),
    };
    const db = {
      select: jest.fn().mockReturnValue(instanceQuery),
      transaction: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
    };
    const service = new (UnlockService as any)(
      db,
      accessScopeService,
    ) as UnlockService;

    await expect(
      service.batchUnlock(
        ['11111111-1111-4111-8111-111111111111'],
        '修正评分',
        'manager-1',
      ),
    ).rejects.toThrow('无权操作该考核实例');

    expect(db.transaction).not.toHaveBeenCalled();
  });
});

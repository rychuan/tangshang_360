import 'reflect-metadata';
import { sql } from 'drizzle-orm';

const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Post: noopDecorator,
    Patch: noopDecorator,
    Delete: noopDecorator,
    Param: noopDecorator,
    Query: noopDecorator,
    Body: noopDecorator,
    Req: noopDecorator,
  };
});

jest.mock('@lark-apaas/fullstack-nestjs-core', () => {
  const actual = jest.requireActual('@lark-apaas/fullstack-nestjs-core');
  return {
    ...actual,
    NeedLogin: noopDecorator,
  };
});

import { AssessmentPublishController } from '../../server/modules/assessment-publish/assessment-publish.controller';
import { AssessmentPublishService } from '../../server/modules/assessment-publish/assessment-publish.service';

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111';

describe('assessment publish access scope', () => {
  const createService = () => {
    const db = {
      select: jest.fn(),
      transaction: jest.fn(),
    };
    const snapshotService = {
      getSnapshot: jest.fn(),
      adjustSnapshot: jest.fn(),
      deleteSnapshot: jest.fn(),
    };
    const accessScopeService = {
      canAccessEmployee: jest.fn().mockResolvedValue(false),
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`TRUE`),
    };
    const unlockService = {
      unlock: jest.fn(),
      batchUnlock: jest.fn(),
      getUnlockHistory: jest.fn(),
    };
    const service = new (AssessmentPublishService as any)(
      db,
      {},
      snapshotService,
      accessScopeService,
      unlockService,
    ) as AssessmentPublishService;

    return {
      service,
      db,
      snapshotService,
      accessScopeService,
      unlockService,
    };
  };

  it('rejects explicitly selected publish employees outside scope before validation', async () => {
    const { service, db, accessScopeService } = createService();
    db.select.mockImplementation(() => {
      throw new Error('publish target queried before scope check');
    });

    await expect(
      service.publish(
        {
          period: '2026-07',
          employeeIds: ['employee-2'],
          appBaseUrl: 'https://example.com/assessment',
        },
        'manager-1',
      ),
    ).rejects.toThrow('无权操作该员工');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('uses the caller scope when resolving implicit publish targets', async () => {
    const employeeQuery = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ employeeId: 'employee-1' }]),
    };
    const { service, db, accessScopeService } = createService();
    db.select.mockReturnValue(employeeQuery);

    await expect(
      (service as any).getEmployeeIdsForPeriod('2026-07', 'manager-1'),
    ).resolves.toEqual(['employee-1']);

    expect(accessScopeService.buildEmployeeScopeCondition).toHaveBeenCalledWith(
      'manager-1',
      { includeSelf: false },
    );
  });

  it.each([
    [
      'read',
      (service: AssessmentPublishService) =>
        (service.getEmployeeSnapshot as any)('employee-2', 'manager-1'),
    ],
    [
      'adjust',
      (service: AssessmentPublishService) =>
        (service.adjustEmployeeSnapshot as any)(
          'employee-2',
          { indicators: [] },
          'manager-1',
        ),
    ],
    [
      'delete',
      (service: AssessmentPublishService) =>
        (service.deleteEmployeeSnapshot as any)('employee-2', 'manager-1'),
    ],
  ])(
    'rejects out-of-scope employee snapshot %s before calling the snapshot service',
    async (_operation, invoke) => {
      const { service, db, snapshotService, accessScopeService } =
        createService();
      db.select.mockImplementation(() => {
        throw new Error('snapshot binding queried before scope check');
      });
      snapshotService.getSnapshot.mockImplementation(() => {
        throw new Error('snapshot read before scope check');
      });
      snapshotService.deleteSnapshot.mockImplementation(() => {
        throw new Error('snapshot delete before scope check');
      });

      await expect(invoke(service)).rejects.toThrow('无权操作该员工');

      expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
        'manager-1',
        'employee-2',
        { includeSelf: false },
      );
      expect(snapshotService.getSnapshot).not.toHaveBeenCalled();
      expect(snapshotService.adjustSnapshot).not.toHaveBeenCalled();
      expect(snapshotService.deleteSnapshot).not.toHaveBeenCalled();
    },
  );

  it('rejects out-of-scope instance indicators before querying snapshots', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ employeeId: 'employee-2' }]),
    };
    const { service, db, accessScopeService } = createService();
    db.select.mockReturnValue(instanceQuery);

    await expect(
      (service.getInstanceIndicators as any)(INSTANCE_ID, 'manager-1'),
    ).rejects.toThrow('无权操作该考核实例');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects out-of-scope batch returns before side effects', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ employeeId: 'employee-2' }]),
    };
    const { service, db, accessScopeService } = createService();
    db.select.mockReturnValue(instanceQuery);

    await expect(
      (service.batchReturn as any)([INSTANCE_ID], 'manager-1'),
    ).rejects.toThrow('无权操作该考核实例');

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'manager-1',
      'employee-2',
      { includeSelf: false },
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('passes the caller to unlock history for object-scope enforcement', async () => {
    const { service, unlockService } = createService();
    unlockService.getUnlockHistory.mockResolvedValue([]);

    await expect(
      (service.getUnlockHistory as any)(INSTANCE_ID, 'manager-1'),
    ).resolves.toEqual([]);

    expect(unlockService.getUnlockHistory).toHaveBeenCalledWith(
      INSTANCE_ID,
      'manager-1',
    );
  });

  it('propagates caller ids for publish object endpoints that previously dropped them', async () => {
    const service = {
      getEmployeeSnapshot: jest.fn().mockResolvedValue({ indicators: [] }),
      deleteEmployeeSnapshot: jest.fn().mockResolvedValue({ success: true }),
      getUnlockHistory: jest.fn().mockResolvedValue([]),
      getInstanceIndicators: jest.fn().mockResolvedValue({ indicators: [] }),
    };
    const controller = new AssessmentPublishController(service as any);
    const request = { userContext: { userId: 'manager-1' } } as any;

    await (controller.getEmployeeSnapshot as any)(request, 'employee-1');
    await (controller.deleteEmployeeSnapshot as any)(request, 'employee-1');
    await (controller.getUnlockHistory as any)(request, INSTANCE_ID);
    await (controller.getInstanceIndicators as any)(request, INSTANCE_ID);

    expect(service.getEmployeeSnapshot).toHaveBeenCalledWith(
      'employee-1',
      'manager-1',
    );
    expect(service.deleteEmployeeSnapshot).toHaveBeenCalledWith(
      'employee-1',
      'manager-1',
    );
    expect(service.getUnlockHistory).toHaveBeenCalledWith(
      INSTANCE_ID,
      'manager-1',
    );
    expect(service.getInstanceIndicators).toHaveBeenCalledWith(
      INSTANCE_ID,
      'manager-1',
    );
  });
});

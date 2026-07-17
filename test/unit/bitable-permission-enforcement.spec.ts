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
    Put: noopDecorator,
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

import { BitableSyncController } from '../../server/modules/bitable-sync/bitable-sync.controller';
import { BitableSyncService } from '../../server/modules/bitable-sync/bitable-sync.service';
import { PerformanceSyncService } from '../../server/modules/bitable-sync/performance-sync.service';
import { BitableConnectionController } from '../../server/modules/bitable-connection/bitable-connection.controller';
import { BitableConnectionService } from '../../server/modules/bitable-connection/bitable-connection.service';

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function whereQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

function fromQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockResolvedValue(rows),
  };
}

function createConnectionImportService(options: {
  existing?: Record<string, unknown>[];
  fields: Record<string, unknown>;
  canAccess?: boolean;
  scopeKind?: 'global' | 'managed' | 'self';
  roles?: string[];
  canManagePermissions?: boolean;
}) {
  const connection = {
    id: 'connection-1',
    name: '员工主表',
    appId: 'app-id',
    appSecret: 'encrypted',
    bitableAppToken: 'base-token',
    tableId: 'table-id',
  };
  const syncLogInsert = {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: 'log-1' }]),
    }),
  };
  const auditInsert = {
    values: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    select: jest
      .fn()
      .mockReturnValueOnce(limitedQuery([connection]))
      .mockReturnValueOnce(whereQuery([]))
      .mockReturnValueOnce(fromQuery([]))
      .mockReturnValueOnce(limitedQuery(options.existing || [])),
    insert: jest
      .fn()
      .mockReturnValueOnce(syncLogInsert)
      .mockReturnValueOnce(auditInsert),
    transaction: jest.fn(),
  };
  const bindingService = {
    bind: jest.fn().mockResolvedValue({ bindingId: 'binding-1' }),
  };
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(options.roles || []),
    checkUserPermission: jest
      .fn()
      .mockResolvedValue(options.canManagePermissions ?? false),
    addUserToEmployeeRole: jest.fn().mockResolvedValue(undefined),
    syncUserRoles: jest.fn().mockResolvedValue(undefined),
  };
  const accessScopeService = {
    canAccessEmployee: jest
      .fn()
      .mockResolvedValue(options.canAccess ?? true),
    getScope: jest.fn().mockResolvedValue({
      kind: options.scopeKind || 'global',
      roles: [],
      departmentIds: [],
      subordinateIds: [],
    }),
    buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`TRUE`),
  };
  const employeeManagementService = {
    syncImportedEmployee: jest.fn().mockImplementation(
      async (
        _employeeId: string,
        body: { role?: string },
      ): Promise<{ success: boolean }> => {
        if (options.canAccess === false) {
          throw new Error('无权操作该员工');
        }
        if (
          body.role &&
          body.role !== 'employee' &&
          !(options.roles || []).includes('admin')
        ) {
          throw new Error('只有系统管理员可修改员工角色');
        }
        if (
          body.role &&
          body.role !== 'employee' &&
          options.canManagePermissions === false
        ) {
          throw new Error('无权修改员工角色');
        }
        return { success: true };
      },
    ),
    create: jest.fn().mockResolvedValue({ id: 'employee-new' }),
    deactivate: jest.fn().mockResolvedValue({ success: true }),
  };
  const service = new (BitableConnectionService as any)(
    db,
    bindingService,
    roleManagerService,
    accessScopeService,
    employeeManagementService,
  ) as BitableConnectionService;
  (service as any).getAccessToken = jest.fn().mockResolvedValue('token');
  (service as any).fetchBitableRecords = jest.fn().mockResolvedValue([
    { record_id: 'record-1', fields: options.fields },
  ]);

  return {
    service,
    db,
    bindingService,
    roleManagerService,
    accessScopeService,
    employeeManagementService,
    syncLogInsert,
  };
}

describe('Bitable permission enforcement', () => {
  it('propagates caller identity through every Bitable connection read controller', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      detail: jest.fn().mockResolvedValue({}),
      getLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getLogDetail: jest.fn().mockResolvedValue({}),
    };
    const controller = new BitableConnectionController(service as any);
    const request = { userContext: { userId: 'operator-1' } };

    await (controller.list as any)(request, '2', '50');
    await (controller.detail as any)(request, 'connection-1');
    await (controller.getLogs as any)(request, 'connection-1', '3', '25');
    await (controller.getLogDetail as any)(
      request,
      'connection-1',
      'log-1',
    );

    expect(service.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 50 },
      'operator-1',
    );
    expect(service.detail).toHaveBeenCalledWith(
      'connection-1',
      'operator-1',
    );
    expect(service.getLogs).toHaveBeenCalledWith(
      'connection-1',
      { page: 3, pageSize: 25 },
      'operator-1',
    );
    expect(service.getLogDetail).toHaveBeenCalledWith(
      'connection-1',
      'log-1',
      'operator-1',
    );
  });

  it.each([
    [
      'list',
      (service: BitableConnectionService) =>
        (service.list as any)({ page: 1, pageSize: 20 }, 'operator-1'),
    ],
    [
      'detail',
      (service: BitableConnectionService) =>
        (service.detail as any)('connection-1', 'operator-1'),
    ],
    [
      'create',
      (service: BitableConnectionService) =>
        service.create(
          {
            name: '员工主表',
            appId: 'app-id',
            appSecret: 'secret',
            bitableAppToken: 'base-token',
            tableId: 'table-id',
          },
          'operator-1',
        ),
    ],
    [
      'update',
      (service: BitableConnectionService) =>
        service.update(
          'connection-1',
          {
            name: '员工主表',
            appId: 'app-id',
            appSecret: 'secret',
            bitableAppToken: 'base-token',
            tableId: 'table-id',
          },
          'operator-1',
        ),
    ],
    [
      'remove',
      (service: BitableConnectionService) =>
        service.remove('connection-1', 'operator-1'),
    ],
    [
      'importEmployees',
      (service: BitableConnectionService) =>
        service.importEmployees('connection-1', 'operator-1'),
    ],
    [
      'exportEmployees',
      (service: BitableConnectionService) =>
        service.exportEmployees('connection-1', 'operator-1'),
    ],
    [
      'getLogs',
      (service: BitableConnectionService) =>
        (service.getLogs as any)(
          'connection-1',
          { page: 1, pageSize: 20 },
          'operator-1',
        ),
    ],
    [
      'getLogDetail',
      (service: BitableConnectionService) =>
        (service.getLogDetail as any)(
          'connection-1',
          'log-1',
          'operator-1',
        ),
    ],
  ] as const)(
    'requires global object scope before Bitable connection %s',
    async (_operation, invoke) => {
      const db = {
        select: jest.fn(() => {
          throw new Error('connection database accessed');
        }),
        insert: jest.fn(() => {
          throw new Error('connection database accessed');
        }),
      };
      const accessScopeService = {
        getScope: jest.fn().mockResolvedValue({
          kind: 'managed',
          roles: ['dept_head'],
          departmentIds: ['dept-1'],
          subordinateIds: [],
        }),
      };
      const service = new (BitableConnectionService as any)(
        db,
        {},
        {},
        accessScopeService,
        {},
      ) as BitableConnectionService;

      await expect(invoke(service)).rejects.toThrow(
        '只有全局范围用户可管理多维表格连接',
      );

      expect(accessScopeService.getScope).toHaveBeenCalledWith('operator-1');
      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it('propagates the caller id through every plugin sync controller entry point', async () => {
    const syncService = {
      importFromBitable: jest.fn().mockResolvedValue({}),
      exportToBitable: jest.fn().mockResolvedValue({}),
    };
    const performanceSyncService = {
      exportToBitable: jest.fn().mockResolvedValue({}),
    };
    const controller = new BitableSyncController(
      syncService as any,
      performanceSyncService as any,
    );
    const request = { userContext: { userId: 'operator-1' } };

    await (controller.importFromBitable as any)(request);
    await (controller.exportToBitable as any)(request);
    await (controller.exportPerformanceToBitable as any)(request);

    expect(syncService.importFromBitable).toHaveBeenCalledWith('operator-1');
    expect(syncService.exportToBitable).toHaveBeenCalledWith('operator-1');
    expect(performanceSyncService.exportToBitable).toHaveBeenCalledWith(
      'operator-1',
    );
  });

  it('applies caller employee scope and audit identity to plugin employee export', async () => {
    const employeeQuery = whereQuery([]);
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const db = {
      select: jest.fn().mockReturnValue(employeeQuery),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
    };
    const capabilityService = {
      load: jest.fn().mockReturnValue({
        call: jest
          .fn()
          .mockResolvedValue({ records: [], hasMore: false }),
      }),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`FALSE`),
    };
    const service = new (BitableSyncService as any)(
      db,
      capabilityService,
      accessScopeService,
      {},
    ) as BitableSyncService;

    await (service.exportToBitable as any)('operator-1');

    expect(
      accessScopeService.buildEmployeeScopeCondition,
    ).toHaveBeenCalledWith('operator-1', { includeSelf: true });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: 'operator-1' }),
    );
  });

  it('applies caller employee scope and audit identity to performance export', async () => {
    const instanceQuery = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    };
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const db = {
      select: jest.fn().mockReturnValue(instanceQuery),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
    };
    const capabilityService = {
      load: jest.fn().mockReturnValue({
        call: jest
          .fn()
          .mockResolvedValue({ records: [], hasMore: false }),
      }),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`FALSE`),
    };
    const service = new (PerformanceSyncService as any)(
      db,
      capabilityService,
      accessScopeService,
    ) as PerformanceSyncService;

    await (service.exportToBitable as any)('operator-1');

    expect(
      accessScopeService.buildEmployeeScopeCondition,
    ).toHaveBeenCalledWith('operator-1', { includeSelf: true });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: 'operator-1' }),
    );
  });

  it('delegates out-of-scope connection imports before employee or binding writes', async () => {
    const { service, db, bindingService, employeeManagementService } =
      createConnectionImportService({
        existing: [
          {
            employeeId: 'employee-2',
            employeeNo: 'E002',
            name: '员工二',
            position: '工程师',
            department: '研发部',
            role: 'employee',
            status: true,
          },
        ],
        fields: {
          姓名: '越权员工',
          工号: 'E002',
          岗位: '高级工程师',
        },
        canAccess: false,
      });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalledWith(
      'employee-2',
      expect.any(Object),
      true,
      'operator-1',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(bindingService.bind).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
  });

  it('records a row failure and never inserts when a new employee lacks a platform user id', async () => {
    const { service, db, roleManagerService, syncLogInsert } =
      createConnectionImportService({
        fields: {
          姓名: '新员工',
          工号: 'E003',
          岗位: '工程师',
        },
        scopeKind: 'global',
      });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.addUserToEmployeeRole).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(syncLogInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.arrayContaining([
          expect.objectContaining({
            status: 'failed',
            reason: expect.stringContaining('飞书用户ID'),
          }),
        ]),
      }),
    );
  });

  it('requires built-in admin identity and permission_management edit before importing a non-employee role', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createConnectionImportService({
      existing: [
        {
          employeeId: 'employee-2',
          employeeNo: 'E002',
          name: '员工二',
          position: '工程师',
          department: '研发部',
          role: 'employee',
          status: true,
        },
      ],
      fields: {
        姓名: '员工二',
        工号: 'E002',
        岗位: '工程师',
        角色: 'supervisor',
      },
      canAccess: true,
      roles: ['admin'],
      canManagePermissions: false,
    });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalled();
    expect(roleManagerService.getUserRoles).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
  });
});

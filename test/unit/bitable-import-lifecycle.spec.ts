import { BitableSyncService } from '../../server/modules/bitable-sync/bitable-sync.service';
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

function createPluginImportService(options: {
  record: Record<string, unknown>;
  existing?: Record<string, unknown>[];
  softDeleted?: Record<string, unknown>[];
  syncError?: Error;
}) {
  const selectResults = [
    whereQuery(options.existing || []),
    ...(options.existing?.length
      ? []
      : [limitedQuery(options.softDeleted || [])]),
  ];
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const db = {
    select: jest.fn().mockImplementation(() => selectResults.shift()),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({ where: updateWhere }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    }),
  };
  const capabilityService = {
    load: jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue({
        records: [{ id: 'record-1', record: options.record }],
        hasMore: false,
      }),
    }),
  };
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(['admin']),
    checkUserPermission: jest.fn().mockResolvedValue(true),
    syncUserRoles: jest.fn().mockResolvedValue(undefined),
  };
  const accessScopeService = {
    canAccessEmployee: jest.fn().mockResolvedValue(true),
    getScope: jest.fn().mockResolvedValue({
      kind: 'global',
      roles: ['admin'],
      departmentIds: [],
      subordinateIds: [],
    }),
  };
  const employeeManagementService = {
    syncImportedEmployee: options.syncError
      ? jest.fn().mockRejectedValue(options.syncError)
      : jest.fn().mockResolvedValue({ success: true }),
    create: jest.fn().mockResolvedValue({ id: 'employee-new' }),
    deactivate: jest.fn().mockResolvedValue({ success: true }),
  };
  const service = new (BitableSyncService as any)(
    db,
    capabilityService,
    accessScopeService,
    employeeManagementService,
  ) as BitableSyncService;

  return {
    service,
    db,
    updateWhere,
    roleManagerService,
    employeeManagementService,
  };
}

function createConnectionImportService(options: {
  fields: Record<string, unknown>;
  existing?: Record<string, unknown>[];
  templates?: Array<{ name: string; id: string }>;
  activeBindings?: Array<{ id: string }>;
  syncError?: Error;
  access?: (includeSelf: boolean | undefined) => boolean;
}) {
  const connection = {
    id: 'connection-1',
    name: '员工主表',
    appId: 'app-id',
    appSecret: 'encrypted',
    bitableAppToken: 'base-token',
    tableId: 'table-id',
  };
  const selectResults = [
    limitedQuery([connection]),
    whereQuery([]),
    fromQuery(options.templates || []),
    limitedQuery(options.existing || []),
    ...(options.activeBindings ? [limitedQuery(options.activeBindings)] : []),
  ];
  const syncLogValues = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([{ id: 'log-1' }]),
  });
  const txUpdateWhere = jest.fn().mockResolvedValue(undefined);
  const txInsertValues = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([{ id: 'employee-new' }]),
  });
  const tx = {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({ where: txUpdateWhere }),
    }),
    insert: jest.fn().mockReturnValue({ values: txInsertValues }),
  };
  const db = {
    select: jest.fn().mockImplementation(() => selectResults.shift()),
    transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
      callback(tx),
    ),
    insert: jest
      .fn()
      .mockReturnValueOnce({ values: syncLogValues })
      .mockReturnValueOnce({
        values: jest.fn().mockResolvedValue(undefined),
      }),
  };
  const bindingService = {
    bind: jest.fn().mockResolvedValue({ bindingId: 'binding-1' }),
  };
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(['admin']),
    checkUserPermission: jest.fn().mockResolvedValue(true),
    syncUserRoles: jest.fn().mockResolvedValue(undefined),
  };
  const accessScopeService = {
    canAccessEmployee: jest
      .fn()
      .mockImplementation(
        (
          _userId: string,
          _employeeId: string,
          scopeOptions: { includeSelf?: boolean },
        ) => options.access?.(scopeOptions.includeSelf) ?? true,
      ),
    getScope: jest.fn().mockResolvedValue({
      kind: 'global',
      roles: ['admin'],
      departmentIds: [],
      subordinateIds: [],
    }),
  };
  const employeeManagementService = {
    syncImportedEmployee: options.syncError
      ? jest.fn().mockRejectedValue(options.syncError)
      : jest.fn().mockResolvedValue({ success: true }),
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
  };
}

describe('Bitable import employee lifecycle', () => {
  it('delegates plugin role and inactive status changes to employee lifecycle enforcement', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createPluginImportService({
        record: {
          姓名: [2002],
          角色: 'employee',
          状态: 'inactive',
        },
        existing: [
          {
            employeeId: '2002',
            name: '管理员',
            position: '负责人',
            department: '管理部',
            role: 'admin',
            status: true,
          },
        ],
      });

    const result = await service.importFromBitable('operator-1');

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalledWith(
      '2002',
      expect.objectContaining({ role: 'employee' }),
      false,
      'operator-1',
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.updated).toBe(1);
  });

  it('turns a plugin last-admin lifecycle rejection into a row failure without direct writes', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createPluginImportService({
        record: {
          姓名: [1001],
          角色: 'employee',
          状态: 'inactive',
        },
        existing: [
          {
            employeeId: '1001',
            name: '唯一管理员',
            position: '负责人',
            department: '管理部',
            role: 'admin',
            status: true,
          },
        ],
        syncError: new Error('系统中至少保留一个系统管理员'),
      });

    const result = await service.importFromBitable('operator-1');

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('keeps an inactive plugin employee inactive when importing only a role change', async () => {
    const { service, employeeManagementService } = createPluginImportService({
      record: {
        姓名: [2003],
        角色: 'supervisor',
      },
      existing: [
        {
          employeeId: '2003',
          name: '停用员工',
          position: '工程师',
          department: '研发部',
          role: 'employee',
          status: false,
        },
      ],
    });

    await service.importFromBitable('operator-1');

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalledWith(
      '2003',
      expect.objectContaining({ role: 'supervisor' }),
      false,
      'operator-1',
    );
  });

  it('creates then deactivates a new inactive plugin employee', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createPluginImportService({
        record: {
          姓名: [3003],
          状态: 'inactive',
        },
      });

    const result = await service.importFromBitable('operator-1');

    expect(employeeManagementService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: '3003', role: 'employee' }),
      'operator-1',
    );
    expect(employeeManagementService.deactivate).toHaveBeenCalledWith(
      '3003',
      'operator-1',
    );
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
  });

  it('restores then deactivates a soft-deleted inactive plugin employee without direct role sync', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createPluginImportService({
        record: {
          姓名: [4004],
          角色: 'supervisor',
          状态: 'inactive',
        },
        softDeleted: [
          {
            id: 'row-4',
            employeeId: '4004',
            deletedAt: new Date('2026-01-01'),
          },
        ],
      });

    const result = await service.importFromBitable('operator-1');

    expect(employeeManagementService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: '4004', role: 'supervisor' }),
      'operator-1',
    );
    expect(employeeManagementService.deactivate).toHaveBeenCalledWith(
      '4004',
      'operator-1',
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
  });

  it('delegates connection role and inactive status changes to employee lifecycle enforcement', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createConnectionImportService({
        fields: {
          姓名: '员工二',
          工号: 'E002',
          岗位: '工程师',
          角色: 'employee',
          状态: 'inactive',
        },
        existing: [
          {
            employeeId: 'employee-2',
            employeeNo: 'E002',
            name: '员工二',
            position: '工程师',
            department: '研发部',
            role: 'admin',
            status: true,
          },
        ],
      });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalledWith(
      'employee-2',
      expect.objectContaining({ role: 'employee' }),
      false,
      'operator-1',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.updatedCount).toBe(1);
  });

  it('creates then deactivates a new inactive connection employee', async () => {
    const { service, db, roleManagerService, employeeManagementService } =
      createConnectionImportService({
        fields: {
          飞书用户ID: 'employee-3',
          姓名: '员工三',
          工号: 'E003',
          岗位: '工程师',
          状态: 'inactive',
        },
      });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(employeeManagementService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'employee-3',
        role: 'employee',
      }),
      'operator-1',
      { bitableConnectionId: 'connection-1' },
    );
    expect(employeeManagementService.deactivate).toHaveBeenCalledWith(
      'employee-3',
      'operator-1',
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(1);
  });

  it('keeps an inactive connection employee inactive when importing only a role change', async () => {
    const { service, employeeManagementService } =
      createConnectionImportService({
        fields: {
          姓名: '停用员工',
          工号: 'E004',
          岗位: '工程师',
          角色: 'supervisor',
        },
        existing: [
          {
            employeeId: 'employee-4',
            employeeNo: 'E004',
            name: '停用员工',
            position: '工程师',
            department: '研发部',
            role: 'employee',
            status: false,
          },
        ],
      });

    await service.importEmployees('connection-1', 'operator-1');

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalledWith(
      'employee-4',
      expect.objectContaining({ role: 'supervisor' }),
      false,
      'operator-1',
    );
  });

  it('checks binding includeSelf false before any connection employee write or side effect', async () => {
    const {
      service,
      db,
      bindingService,
      roleManagerService,
      accessScopeService,
      employeeManagementService,
    } = createConnectionImportService({
      fields: {
        姓名: '本人',
        工号: 'SELF',
        岗位: '工程师',
        考核模板: '季度模板',
      },
      existing: [
        {
          employeeId: 'operator-1',
          employeeNo: 'SELF',
          name: '本人',
          position: '工程师',
          department: '研发部',
          role: 'employee',
          status: true,
        },
      ],
      templates: [{ name: '季度模板', id: 'template-1' }],
      activeBindings: [],
      access: (includeSelf) => includeSelf === true,
    });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(accessScopeService.canAccessEmployee).toHaveBeenCalledWith(
      'operator-1',
      'operator-1',
      { includeSelf: false },
    );
    expect(employeeManagementService.syncImportedEmployee).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(bindingService.bind).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
  });

  it('turns a connection last-admin lifecycle rejection into a row failure without binding', async () => {
    const {
      service,
      db,
      bindingService,
      roleManagerService,
      employeeManagementService,
    } = createConnectionImportService({
      fields: {
        姓名: '唯一管理员',
        工号: 'ADMIN',
        岗位: '负责人',
        角色: 'employee',
        状态: 'inactive',
      },
      existing: [
        {
          employeeId: 'admin-1',
          employeeNo: 'ADMIN',
          name: '唯一管理员',
          position: '负责人',
          department: '管理部',
          role: 'admin',
          status: true,
        },
      ],
      syncError: new Error('系统中至少保留一个系统管理员'),
    });

    const result = await service.importEmployees(
      'connection-1',
      'operator-1',
    );

    expect(employeeManagementService.syncImportedEmployee).toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(roleManagerService.syncUserRoles).not.toHaveBeenCalled();
    expect(bindingService.bind).not.toHaveBeenCalled();
    expect(result.failedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
  });
});

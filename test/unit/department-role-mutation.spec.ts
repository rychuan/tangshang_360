import { DepartmentService } from '../../server/modules/department/department.service';
import { ForbiddenException } from '@nestjs/common';

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function createDepartmentInsert(id = 'dept-1') {
  return {
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id }]),
    }),
  };
}

describe('department head role mutation', () => {
  it('requires built-in admin identity and permission_management edit before assigning a head', async () => {
    const db = {
      select: jest.fn(() => {
        throw new Error('department query attempted');
      }),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'global',
          roles: ['admin'],
          departmentIds: [],
          subordinateIds: [],
        }),
      },
    ) as DepartmentService;

    const request = service.create(
      {
        name: '研发部',
        headId: 'head-1',
      },
      'operator-1',
    );

    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).rejects.toThrow('无权修改部门负责人');

    expect(roleManagerService.getUserRoles).toHaveBeenCalledWith('operator-1');
    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'operator-1',
      'permission_management',
      'edit',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('keeps department creation, audit, and strict head assignment in one transaction callback', async () => {
    const departmentInsert = createDepartmentInsert();
    const auditInsert = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(departmentInsert)
        .mockReturnValueOnce(auditInsert),
    };
    let callbackActive = false;
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([])),
      insert: jest.fn(() => {
        throw new Error('out-of-transaction insert');
      }),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      ensureUserRole: jest.fn().mockResolvedValue(undefined),
      ensureUserRoleStrict: jest
        .fn()
        .mockImplementation(async () => {
          expect(callbackActive).toBe(true);
          throw new Error('sdk role assignment failed');
        }),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'global',
          roles: ['admin'],
          departmentIds: [],
          subordinateIds: [],
        }),
      },
    ) as DepartmentService;

    await expect(
      service.create(
        {
          name: '研发部',
          headId: 'head-1',
        },
        'operator-1',
      ),
    ).rejects.toThrow('sdk role assignment failed');

    expect(roleManagerService.ensureUserRoleStrict).toHaveBeenCalledWith(
      'head-1',
      'dept_head',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('keeps department update, audit, and both strict head mutations in one transaction callback', async () => {
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      update: jest.fn().mockReturnValue({ set: updateSet }),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
      select: jest.fn().mockReturnValue(limitedQuery([])),
    };
    let callbackActive = false;
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            {
              id: 'dept-1',
              oldHeadId: 'head-old',
              oldName: '研发部',
            },
          ]),
        )
        .mockImplementation(() => {
          throw new Error('out-of-transaction head query');
        }),
      update: jest.fn(() => {
        throw new Error('out-of-transaction update');
      }),
      insert: jest.fn(() => {
        throw new Error('out-of-transaction insert');
      }),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      removeUserRoleStrict: jest.fn().mockImplementation(async () => {
        expect(callbackActive).toBe(true);
      }),
      ensureUserRoleStrict: jest.fn().mockImplementation(async () => {
        expect(callbackActive).toBe(true);
        throw new Error('sdk new-head assignment failed');
      }),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'global',
          roles: ['admin'],
          departmentIds: [],
          subordinateIds: [],
        }),
      },
    ) as DepartmentService;

    await expect(
      service.update(
        'dept-1',
        {
          name: '研发部',
          headId: 'head-new',
        },
        'operator-1',
      ),
    ).rejects.toThrow('sdk new-head assignment failed');

    expect(roleManagerService.removeUserRoleStrict).toHaveBeenCalledWith(
      'head-old',
      'dept_head',
    );
    expect(roleManagerService.ensureUserRoleStrict).toHaveBeenCalledWith(
      'head-new',
      'dept_head',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('requires role-management authority when deleting the final department-head assignment', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { id: 'dept-1', name: '研发部', headId: 'head-1' },
          ]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(limitedQuery([])),
      delete: jest.fn(() => {
        throw new Error('department delete attempted');
      }),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(false),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'global',
          roles: ['admin'],
          departmentIds: [],
          subordinateIds: [],
        }),
      },
    ) as DepartmentService;

    await expect(service.remove('dept-1', 'operator-1')).rejects.toThrow(
      '无权修改部门负责人',
    );

    expect(roleManagerService.checkUserPermission).toHaveBeenCalledWith(
      'operator-1',
      'permission_management',
      'edit',
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('keeps department delete, audit, and strict final-head removal in one transaction callback', async () => {
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      delete: jest.fn().mockReturnValue({ where: deleteWhere }),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
    };
    let callbackActive = false;
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          limitedQuery([
            { id: 'dept-1', name: '研发部', headId: 'head-1' },
          ]),
        )
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([{ cnt: 0 }]),
        })
        .mockReturnValueOnce(limitedQuery([])),
      delete: jest.fn(() => {
        throw new Error('out-of-transaction delete');
      }),
      insert: jest.fn(() => {
        throw new Error('out-of-transaction insert');
      }),
      transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) => {
          callbackActive = true;
          try {
            return await callback(tx);
          } finally {
            callbackActive = false;
          }
        },
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
      removeUserRoleStrict: jest.fn().mockImplementation(async () => {
        expect(callbackActive).toBe(true);
        throw new Error('sdk head removal failed');
      }),
    };
    const service = new (DepartmentService as any)(
      db,
      {},
      roleManagerService,
      {
        getScope: jest.fn().mockResolvedValue({
          kind: 'global',
          roles: ['admin'],
          departmentIds: [],
          subordinateIds: [],
        }),
      },
    ) as DepartmentService;

    await expect(service.remove('dept-1', 'operator-1')).rejects.toThrow(
      'sdk head removal failed',
    );

    expect(roleManagerService.removeUserRoleStrict).toHaveBeenCalledWith(
      'head-1',
      'dept_head',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

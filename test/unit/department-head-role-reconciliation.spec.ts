import { EmployeeAuthorizationService } from '../../server/modules/employee-management/employee-authorization.service';
import { EmployeeManagementService } from '../../server/modules/employee-management/employee-management.service';

/**
 * 方案A 专项测试：dept_head 角色的唯一入口是部门 head 指派。
 * 验证 EmployeeAuthorizationService.reconcileDepartmentHeadRole：
 * - 员工是某部门 head（department.head_id 指向他）→ 补回 dept_head
 * - 员工不是 head → 人工角色中携带的 dept_head 一律剔除
 */

function limitedQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

function createReconcileService(headLookupRows: unknown[]) {
  const tx = {
    select: jest.fn().mockReturnValue(limitedQuery(headLookupRows)),
  };
  const service = new EmployeeAuthorizationService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, tx };
}

describe('dept_head role reconciliation (方案A: head 指派为唯一入口)', () => {
  it('re-adds dept_head when the employee is a current department head', async () => {
    const { service, tx } = createReconcileService([{ id: 'dept-1' }]);

    const roles = await (service as any).reconcileDepartmentHeadRole(
      tx,
      'head-1',
      ['employee', 'supervisor'],
    );

    // normalizeAuthorizationRoles 排序：d < e < s
    expect(roles).toEqual(['dept_head', 'employee', 'supervisor']);
    expect(tx.select).toHaveBeenCalled();
  });

  it('strips dept_head when the employee is not a department head', async () => {
    const { service, tx } = createReconcileService([]);

    const roles = await (service as any).reconcileDepartmentHeadRole(
      tx,
      'plain-1',
      ['dept_head', 'employee'],
    );

    expect(roles).toEqual(['employee']);
    expect(tx.select).toHaveBeenCalled();
  });

  it('strips dept_head and dedupes when not a head', async () => {
    const { service } = createReconcileService([]);

    const roles = await (service as any).reconcileDepartmentHeadRole(
      {
        select: jest.fn().mockReturnValue(limitedQuery([])),
      },
      'plain-2',
      ['employee', 'dept_head', 'employee'],
    );

    expect(roles).toEqual(['employee']);
  });

  it('parseManualRoles always strips dept_head and keeps employee', () => {
    const { service } = createReconcileService([]);

    expect(
      (service as any).parseManualRoles('employee,dept_head,supervisor'),
    ).toEqual(['employee', 'supervisor']);
    // 显式传 dept_head（被剥离）后仍强制保留 employee 基础角色
    expect((service as any).parseManualRoles('dept_head')).toEqual([
      'employee',
    ]);
    // 显式传管理角色（不带 employee）也强制补上 employee
    expect((service as any).parseManualRoles('admin')).toEqual([
      'employee',
      'admin',
    ]);
    expect((service as any).parseManualRoles(undefined)).toEqual(['employee']);
  });

  it('head employee saving profile (role carries dept_head) is NOT treated as a role change', async () => {
    // 前端编辑 head 员工时 formData.role 含 dept_head（只读勾选），保存时会随 body 发送。
    // 后端必须剥离后比较，避免误判角色变更/要求管理员权限，且最终不重复 stage。
    const employeeRow = {
      employeeId: 'head-1',
      role: 'employee',
      status: true,
      authorizationRoles: ['dept_head', 'employee'],
      authorizationStatus: 'synced',
      deletedAt: null,
      departmentId: 'dept-1',
    };
    const tx = {
      execute: jest.fn().mockResolvedValue([{ got_lock: true }]),
      select: jest.fn((columns: Record<string, unknown>) => {
        const isDepartmentQuery =
          columns && Object.keys(columns).length === 1 && 'id' in columns;
        return limitedQuery(isDepartmentQuery ? [{ id: 'dept-1' }] : [employeeRow]);
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue(limitedQuery([employeeRow])),
      transaction: jest.fn(
        async (callback: (value: unknown) => unknown) => callback(tx),
      ),
    };
    const roleManagerService = {
      getUserRoles: jest.fn().mockResolvedValue(['admin']),
      checkUserPermission: jest.fn().mockResolvedValue(true),
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
    const authorizationSyncService = {
      stageAuthorizationChange: jest.fn().mockResolvedValue(1),
      processEmployeeAuthorization: jest.fn().mockResolvedValue({
        status: 'synced',
        version: 1,
      }),
    };
    const employeeAuthService = new EmployeeAuthorizationService(
      db as any,
      roleManagerService as any,
      authorizationSyncService as any,
      accessScopeService as any,
    );
    const service = new (EmployeeManagementService as any)(
      db,
      roleManagerService,
      {},
      accessScopeService,
      authorizationSyncService,
      employeeAuthService,
    ) as EmployeeManagementService;

    const result = await service.update(
      'head-1',
      {
        name: '负责人',
        position: '总监',
        role: 'employee,dept_head',
      },
      'admin-1',
    );

    expect(result).toEqual({ success: true });
    // 对账后角色与当前一致 → 不重复 stage
    expect(authorizationSyncService.stageAuthorizationChange).not.toHaveBeenCalled();
  });
});

import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

import { ForbiddenException } from '@nestjs/common';
import { DepartmentController } from '../../server/modules/department/department.controller';
import { DepartmentService } from '../../server/modules/department/department.service';

function listQuery<T>(rows: T[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  };
}

function scoreQuery() {
  // 部门平均分查询链：select().from().innerJoin().where().groupBy()
  return {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

function managedScope(departmentIds: string[]) {
  return {
    kind: 'managed' as const,
    roles: ['dept_head'],
    departmentIds,
    subordinateIds: [],
  };
}

function createService(options: {
  scope:
    | ReturnType<typeof managedScope>
    | {
        kind: 'global' | 'self';
        roles: string[];
        departmentIds: string[];
        subordinateIds: string[];
      };
  db?: Record<string, jest.Mock>;
}) {
  const db =
    options.db ||
    ({
      select: jest.fn(() => {
        throw new Error('department query attempted');
      }),
      transaction: jest.fn(),
    } as Record<string, jest.Mock>);
  const employeeRepo = {
    nameSubquery: jest.fn(),
    getDepartmentMemberCounts: jest.fn().mockResolvedValue(new Map()),
  };
  const roleManagerService = {
    getUserRoles: jest.fn().mockResolvedValue(options.scope.roles),
    checkUserPermission: jest.fn().mockResolvedValue(true),
  };
  const accessScopeService = {
    getScope: jest.fn().mockResolvedValue(options.scope),
  };
  const service = new (DepartmentService as any)(
    db,
    employeeRepo,
    roleManagerService,
    accessScopeService,
  ) as DepartmentService;

  return {
    service,
    db,
    employeeRepo,
    roleManagerService,
    accessScopeService,
  };
}

describe('department data scope', () => {
  it('injects AccessScopeModule into DepartmentModule', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../server/modules/department/department.module.ts',
      ),
      'utf8',
    );

    expect(source).toContain(
      "import { AccessScopeModule } from '@server/common/access/access-scope.module';",
    );
    expect(source).toMatch(
      /imports:\s*\[[^\]]*AccessScopeModule[^\]]*\]/,
    );
  });

  it('passes the authenticated user through all department read controllers', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [], tree: [] }),
      listFlat: jest.fn().mockResolvedValue([]),
      detail: jest.fn().mockResolvedValue({ id: 'dept-1', children: [] }),
    };
    const controller = new DepartmentController(service as any);
    const request = { userContext: { userId: 'manager-1' } };

    await (controller.list as any)(request);
    await (controller.listFlat as any)(request);
    await (controller.detail as any)(request, 'dept-1');

    expect(service.list).toHaveBeenCalledWith('manager-1');
    expect(service.listFlat).toHaveBeenCalledWith('manager-1');
    expect(service.detail).toHaveBeenCalledWith('dept-1', 'manager-1');
  });

  it('keeps login protection on department list, flat-list, and detail reads', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../server/modules/department/department.controller.ts',
      ),
      'utf8',
    );

    expect(source).toMatch(
      /@RequirePermission\('organization', 'view'\)\s+@NeedLogin\(\)\s+@Get\(\)\s+async list/,
    );
    expect(source).toMatch(
      /@RequirePermission\('organization', 'view'\)\s+@NeedLogin\(\)\s+@Get\('flat'\)\s+async listFlat/,
    );
    expect(source).toMatch(
      /@RequirePermission\('organization', 'view'\)\s+@NeedLogin\(\)\s+@Get\(':id'\)\s+async detail/,
    );
  });

  it.each([
    {
      name: 'self scope',
      scope: {
        kind: 'self' as const,
        roles: ['employee'],
        departmentIds: [],
        subordinateIds: [],
      },
    },
    {
      name: 'managed scope without department ids',
      scope: managedScope([]),
    },
  ])('fails closed for $name before listing departments', async ({ scope }) => {
    const { service, db } = createService({ scope });

    await expect(service.list('manager-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('applies the managed department id restriction to list reads', async () => {
    const query = listQuery([
      {
        id: 'dept-1',
        name: '研发部',
        parentId: null,
        headId: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        headName: '',
        parentName: '',
      },
    ]);
    const { service, accessScopeService } = createService({
      scope: managedScope(['dept-1']),
      db: {
        select: jest
          .fn()
          .mockReturnValueOnce(query)
          .mockReturnValueOnce(scoreQuery()),
      },
    });

    const result = await service.list('manager-1');

    expect(accessScopeService.getScope).toHaveBeenCalledWith('manager-1');
    expect(query.where).toHaveBeenCalledWith(expect.anything());
    expect(result.items.map((item) => item.id)).toEqual(['dept-1']);
  });

  it('rejects an out-of-scope department detail before querying it', async () => {
    const { service, db } = createService({
      scope: managedScope(['dept-1']),
    });

    await expect(service.detail('dept-2', 'manager-1')).rejects.toThrow(
      '无权访问该部门',
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('allows global scope to read any department detail', async () => {
    const detailQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          id: 'dept-2',
          name: '财务部',
          parentId: null,
          headId: null,
          sortOrder: 0,
          isActive: true,
          createdAt: new Date('2026-01-01'),
          headName: '',
          parentName: '',
        },
      ]),
    };
    const childQuery = listQuery([]);
    const { service } = createService({
      scope: {
        kind: 'global',
        roles: ['hrd'],
        departmentIds: [],
        subordinateIds: [],
      },
      db: {
        select: jest
          .fn()
          .mockReturnValueOnce(detailQuery)
          .mockReturnValueOnce(scoreQuery())
          .mockReturnValueOnce(childQuery),
      },
    });

    await expect(service.detail('dept-2', 'hrd-1')).resolves.toEqual(
      expect.objectContaining({ id: 'dept-2', children: [] }),
    );
  });

  it('requires global scope before department creation', async () => {
    const { service, db } = createService({
      scope: managedScope(['dept-1']),
    });

    await expect(
      service.create({ name: '新部门' }, 'manager-1'),
    ).rejects.toThrow('只有全局范围用户可创建部门');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects moving a managed department under an out-of-scope parent before querying or mutating', async () => {
    const { service, db } = createService({
      scope: managedScope(['dept-1']),
    });

    await expect(
      service.update(
        'dept-1',
        {
          name: '研发部',
          parentId: 'dept-2',
          sortOrder: 1,
        },
        'manager-1',
      ),
    ).rejects.toThrow('无权访问该部门');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects deleting an out-of-scope department before loading it', async () => {
    const { service, db } = createService({
      scope: managedScope(['dept-1']),
    });

    await expect(service.remove('dept-2', 'manager-1')).rejects.toThrow(
      '无权访问该部门',
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

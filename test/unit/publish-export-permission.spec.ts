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
    CanRole: noopDecorator,
  };
});

import { PERMISSION_META_KEY } from '../../server/common/decorators/require-permission.decorator';
import { AssessmentPublishController } from '../../server/modules/assessment-publish/assessment-publish.controller';
import {
  AssessmentPublishService,
  normalizePublishExportIds,
} from '../../server/modules/assessment-publish/assessment-publish.service';

describe('published assessment export permission', () => {
  it('requires publish management export permission', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      (AssessmentPublishController.prototype as any).exportInstances,
    );

    expect(metadata).toEqual({
      resource: 'publish_management',
      action: 'export',
    });
  });

  it('deduplicates export ids and limits one export to 1000 records', () => {
    expect(normalizePublishExportIds(['id-1', 'id-1', 'id-2'])).toEqual([
      'id-1',
      'id-2',
    ]);
    expect(() =>
      normalizePublishExportIds(
        Array.from({ length: 1001 }, (_, index) => `id-${index}`),
      ),
    ).toThrow('单次最多导出 1000 条绩效记录');
  });

  it('returns no rows without querying for an empty export', async () => {
    const db = { select: jest.fn() };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn(),
    };
    const service = new (AssessmentPublishService as any)(
      db,
      {},
      {},
      accessScopeService,
      {},
    ) as AssessmentPublishService;

    await expect(
      (service as any).exportInstances([], 'user-1'),
    ).resolves.toEqual({ items: [] });
    expect(db.select).not.toHaveBeenCalled();
    expect(
      accessScopeService.buildEmployeeScopeCondition,
    ).not.toHaveBeenCalled();
  });

  it('applies the current user scope when exporting selected records', async () => {
    const instanceScopeQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ employeeId: 'employee-1' }]),
    };
    const itemsQuery = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockResolvedValue([]),
    };
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(instanceScopeQuery)
        .mockReturnValueOnce(itemsQuery),
    };
    const accessScopeService = {
      buildEmployeeScopeCondition: jest.fn().mockResolvedValue(sql`TRUE`),
      canAccessEmployee: jest.fn().mockResolvedValue(true),
    };
    const service = new (AssessmentPublishService as any)(
      db,
      {},
      {},
      accessScopeService,
      {},
    ) as AssessmentPublishService;

    await (service as any).exportInstances(
      ['11111111-1111-4111-8111-111111111111'],
      'manager-1',
    );

    expect(accessScopeService.buildEmployeeScopeCondition).toHaveBeenCalledWith(
      'manager-1',
      { includeSelf: false },
    );
  });
});

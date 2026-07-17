import 'reflect-metadata';

const noopDecorator = () => () => undefined;

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Controller: noopDecorator,
    Get: noopDecorator,
    Post: noopDecorator,
    Param: noopDecorator,
    Body: noopDecorator,
    Req: noopDecorator,
    Query: noopDecorator,
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
import { AssessmentOperationController } from '../../server/modules/assessment-operation/assessment-operation.controller';

describe('statistics PDF export permission', () => {
  it('requires statistics export permission for export detail', () => {
    const metadata = Reflect.getMetadata(
      PERMISSION_META_KEY,
      (AssessmentOperationController.prototype as any).exportDetail,
    );

    expect(metadata).toEqual({ resource: 'statistics', action: 'export' });
  });
});

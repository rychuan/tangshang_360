import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const controllerRoot = path.resolve(__dirname, '../../server/modules');
const identitySensitive = new Set(['role-manager.controller.ts']);
const intentionalBootstrapHandlers = [
  'assessment-operation/assessment-operation.controller.ts#signSession',
  'assessment-operation/assessment-operation.controller.ts#signStatus',
  'employee-management/employee-management.controller.ts#getMyPermissions',
  'role-manager/role-manager.controller.ts#getMyPermissions',
  'role-manager/role-manager.controller.ts#getMyRoles',
  'view/view.controller.ts#render',
];

function getDecoratorName(decorator: ts.Decorator): string | null {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : null;
}

function findUnprotectedHandlers(
  source: string,
): Array<{ methodName: string; hasNeedLogin: boolean }> {
  const sourceFile = ts.createSourceFile(
    'controller.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const handlers: Array<{ methodName: string; hasNeedLogin: boolean }> = [];
  const routeDecorators = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

  const visit = (node: ts.Node) => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const decorators = ts.canHaveDecorators(node)
        ? ts.getDecorators(node) || []
        : [];
      const names = decorators
        .map(getDecoratorName)
        .filter((name): name is string => Boolean(name));
      if (
        names.some((name) => routeDecorators.has(name)) &&
        !names.includes('RequirePermission')
      ) {
        handlers.push({
          methodName: node.name.text,
          hasNeedLogin: names.includes('NeedLogin'),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return handlers;
}

describe('backend capability role consistency', () => {
  it('keeps fixed role decorators only on identity-sensitive controllers', () => {
    const violations: string[] = [];

    for (const moduleName of fs.readdirSync(controllerRoot)) {
      const modulePath = path.join(controllerRoot, moduleName);
      if (!fs.statSync(modulePath).isDirectory()) continue;

      for (const fileName of fs.readdirSync(modulePath)) {
        if (!fileName.endsWith('.controller.ts')) continue;
        if (identitySensitive.has(fileName)) continue;

        const source = fs.readFileSync(path.join(modulePath, fileName), 'utf8');
        if (source.includes('@CanRole(')) {
          violations.push(`${moduleName}/${fileName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps role-manager identity restrictions', () => {
    const source = fs.readFileSync(
      path.join(controllerRoot, 'role-manager/role-manager.controller.ts'),
      'utf8',
    );
    expect(source).toContain("@CanRole(['admin', 'hrd'])");
    expect(source).toContain("@CanRole(['admin'])");
  });

  it('keeps every unprotected route handler in the explicit bootstrap inventory', () => {
    const unprotectedHandlers: string[] = [];

    for (const moduleName of fs.readdirSync(controllerRoot)) {
      const modulePath = path.join(controllerRoot, moduleName);
      if (!fs.statSync(modulePath).isDirectory()) continue;

      for (const fileName of fs.readdirSync(modulePath)) {
        if (!fileName.endsWith('.controller.ts')) continue;
        const source = fs.readFileSync(path.join(modulePath, fileName), 'utf8');
        for (const handler of findUnprotectedHandlers(source)) {
          unprotectedHandlers.push(
            `${moduleName}/${fileName}#${handler.methodName}`,
          );
        }
      }
    }

    expect(unprotectedHandlers.sort()).toEqual(
      intentionalBootstrapHandlers.slice().sort(),
    );
  });

  it('keeps login protection on intentional permission-free handlers except the public render route', () => {
    const missingLogin: string[] = [];

    for (const moduleName of fs.readdirSync(controllerRoot)) {
      const modulePath = path.join(controllerRoot, moduleName);
      if (!fs.statSync(modulePath).isDirectory()) continue;

      for (const fileName of fs.readdirSync(modulePath)) {
        if (!fileName.endsWith('.controller.ts')) continue;
        const source = fs.readFileSync(path.join(modulePath, fileName), 'utf8');
        for (const handler of findUnprotectedHandlers(source)) {
          const key = `${moduleName}/${fileName}#${handler.methodName}`;
          if (
            key !== 'view/view.controller.ts#render' &&
            !handler.hasNeedLogin
          ) {
            missingLogin.push(key);
          }
        }
      }
    }

    expect(missingLogin).toEqual([]);
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

const controllerRoot = path.resolve(__dirname, '../../server/modules');
const identitySensitive = new Set(['role-manager.controller.ts']);

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
});

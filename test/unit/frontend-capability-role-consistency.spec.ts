import * as fs from 'node:fs';
import * as path from 'node:path';

const clientRoot = path.resolve(__dirname, '../../client/src');
const identitySensitive = new Set([
  'pages/EmployeeManagement/RoleListPanel.tsx',
  'pages/EmployeeManagement/RoleMembersTab.tsx',
  'pages/EmployeeManagement/PermissionMatrixTab.tsx',
]);

function walk(directory: string): string[] {
  return fs.readdirSync(directory).flatMap((name) => {
    const fullPath = path.join(directory, name);
    return fs.statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
  });
}

it('keeps CanRole only on permission administration controls', () => {
  const violations = walk(clientRoot)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => {
      const relative = path.relative(clientRoot, file);
      return (
        !identitySensitive.has(relative) &&
        fs.readFileSync(file, 'utf8').includes('<CanRole')
      );
    })
    .map((file) => path.relative(clientRoot, file));

  expect(violations).toEqual([]);
});

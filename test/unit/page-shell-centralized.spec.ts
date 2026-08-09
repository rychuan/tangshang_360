import * as fs from 'node:fs';
import * as path from 'node:path';

function readClient(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../client/src', relativePath),
    'utf8',
  );
}

// 视口高度约束收敛到 PageShell（PAGE_VIEWPORT_HEIGHT_CLASS）：
// 页面不允许再手写 calc(100svh-…) 魔法数字，避免顶栏/内边距变更时逐页修改。
describe('page viewport height is centralized in PageShell', () => {
  const pageSources = [
    'pages/EmployeeManagement/EmployeeManagementPage.tsx',
    'pages/EmployeeManagement/PermissionPage.tsx',
  ];

  it.each(pageSources)('%s uses PageShell and no raw viewport calc', (file) => {
    const source = readClient(file);
    expect(source).toContain('PageShell');
    expect(source).not.toMatch(/h-\[calc\(100svh/i);
  });

  it('defines the viewport height class exactly once in PageShell', () => {
    const shell = readClient('components/business-ui/page-shell.tsx');
    expect(shell).toContain("PAGE_VIEWPORT_HEIGHT_CLASS = 'h-[calc(100svh-6.5rem)]'");
    // 页面文件里不允许出现 calc(100svh
    const pages = fs
      .readdirSync(path.resolve(__dirname, '../../client/src/pages'))
      .flatMap((dir) =>
        fs
          .readdirSync(
            path.resolve(__dirname, `../../client/src/pages/${dir}`),
            { recursive: true },
          )
          .map((f) => `${dir}/${f}`)
          .filter((f) => f.endsWith('.tsx')),
      );
    for (const page of pages) {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../client/src/pages', page),
        'utf8',
      );
      expect(source).not.toMatch(/h-\[calc\(100svh/i);
    }
  });
});

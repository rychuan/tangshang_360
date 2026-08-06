import * as fs from 'node:fs';
import * as path from 'node:path';

function readClient(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../client/src', relativePath),
    'utf8',
  );
}

// 侧边栏固定 220px：内容区宽度 = 视口 − 220px。用视口断点（lg: 1024 视口）
// 会让多列布局在内容区仅 ~800px 时提前触发（1366×768@125% 时视口 1093、
// 内容区 873），导致三列卡片、图表、8 列表格挤压溢出。
// 正确方案：改用容器查询变体（@lg: / @min-[…]:），以实际内容宽度为断点。
describe('responsive layout uses container-query breakpoints', () => {
  it('team performance stats row keys off the content container, not the viewport', () => {
    const source = readClient('pages/TeamPerformance/TeamPerformancePage.tsx');
    expect(source).toContain('@lg:grid-cols-3');
    expect(source).not.toMatch(/\bgrid-cols-1\s+lg:grid-cols-3\b/);
  });

  it('statistics charts fill the row only when the container is wide enough', () => {
    const source = readClient('pages/Statistics/StatisticsPage.tsx');
    expect(source).toContain('@lg:grid-cols-3');
    expect(source).not.toContain('md:grid-cols-3');
  });

  it('statistics table hides wide columns until the container reaches lg', () => {
    const source = readClient('pages/Statistics/StatisticsPage.tsx');
    expect(source).toContain('hidden @lg:table-cell');
    expect(source).not.toContain('hidden lg:table-cell');
  });

  it('employee table hides department/supervisor/binding below container lg', () => {
    const source = readClient('pages/EmployeeManagement/EmployeeTable.tsx');
    expect(source).toContain('hidden @lg:table-cell');
    expect(source).not.toContain('hidden lg:table-cell');
  });

  it('home dashboard two-column grids are container-query based', () => {
    const home = readClient('pages/HomePage/HomePage.tsx');
    const charts = readClient('pages/HomePage/DashboardCharts.tsx');
    expect(home).toMatch(/@min-\[820px\]:grid-cols-/);
    expect(charts).toMatch(/@min-\[820px\]:grid-cols-/);
    expect(home).not.toContain('xl:grid-cols-');
    expect(charts).not.toContain('xl:grid-cols-');
  });
});

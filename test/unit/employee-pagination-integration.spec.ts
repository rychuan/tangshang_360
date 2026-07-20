import * as fs from 'node:fs';
import * as path from 'node:path';

function readSource(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../..', relativePath),
    'utf8',
  );
}

describe('employee pagination integration', () => {
  it('stores normalized page and page size in URL-driven employee filters', () => {
    const source = readSource(
      'client/src/pages/EmployeeManagement/hooks/useEmployeeFilters.ts',
    );

    expect(source).toContain('pageSize: number');
    expect(source).toContain('setPageSize: (v: number) => void');
    expect(source).toContain("normalizeEmployeePage(searchParams.get('page'))");
    expect(source).toContain(
      "normalizeEmployeePageSize(searchParams.get('pageSize'))",
    );
    expect(source).toContain(
      "setPageSize: (v: number) => updateParam('pageSize', String(v))",
    );
    expect(source).toMatch(
      /if \(key !== 'page'\) \{[\s\S]*next\.set\('page', '1'\)/,
    );
  });

  it('requests the selected page size and reacts to every employee filter', () => {
    const source = readSource(
      'client/src/pages/EmployeeManagement/hooks/useEmployeeList.ts',
    );

    expect(source).toContain('pageSize: filters.pageSize');
    expect(source).toContain('filters.binding,');
    expect(source).toContain('filters.pageSize,');
  });

  it('corrects an employee page that is beyond the last available page', () => {
    const source = readSource(
      'client/src/pages/EmployeeManagement/hooks/useEmployeeList.ts',
    );

    expect(source).toContain('onPageOutOfRange');
    expect(source).toContain(
      'getEmployeeTotalPages(res.total, filters.pageSize)',
    );
    expect(source).toMatch(
      /filters\.page > totalPages[\s\S]*onPageOutOfRange\(totalPages\)/,
    );
  });

  it('uses shared employee pagination normalization in the controller', () => {
    const source = readSource(
      'server/modules/employee-management/employee-management.controller.ts',
    );

    expect(source).toContain('normalizeEmployeePage');
    expect(source).toContain('normalizeEmployeePageSize');
    expect(source).toContain('page: normalizeEmployeePage(page)');
    expect(source).toContain('pageSize: normalizeEmployeePageSize(pageSize)');
  });

  it('renders configurable employee pagination with boundary states', () => {
    const source = readSource(
      'client/src/pages/EmployeeManagement/EmployeeListTab.tsx',
    );

    expect(source).toContain('EMPLOYEE_PAGE_SIZES');
    expect(source).toContain('getEmployeeTotalPages(total, filters.pageSize)');
    expect(source).toContain(
      'getEmployeeVisiblePages(filters.page, totalPages)',
    );
    expect(source).toContain('onPageOutOfRange: setters.setPage');
    expect(source).toContain('value={String(filters.pageSize)}');
    expect(source).toContain('setters.setPageSize(Number(value))');
    expect(source).toContain('第 {filters.page} / {totalPages} 页');
    expect(source).toContain('aria-disabled={filters.page === 1}');
    expect(source).toContain('aria-disabled={filters.page === totalPages}');
  });
});

import {
  DEFAULT_EMPLOYEE_PAGE_SIZE,
  EMPLOYEE_PAGE_SIZES,
  getEmployeeTotalPages,
  getEmployeeVisiblePages,
  normalizeEmployeePage,
  normalizeEmployeePageSize,
} from '../../shared/employee-pagination';

describe('employee pagination rules', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['-2', 1],
    ['0', 1],
    ['2.5', 1],
    ['3', 3],
    [4, 4],
  ])('normalizes page %p to %p', (value, expected) => {
    expect(normalizeEmployeePage(value)).toBe(expected);
  });

  it('accepts only supported employee page sizes', () => {
    expect(EMPLOYEE_PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_EMPLOYEE_PAGE_SIZE).toBe(20);

    for (const pageSize of EMPLOYEE_PAGE_SIZES) {
      expect(normalizeEmployeePageSize(String(pageSize))).toBe(pageSize);
    }

    expect(normalizeEmployeePageSize(undefined)).toBe(20);
    expect(normalizeEmployeePageSize('')).toBe(20);
    expect(normalizeEmployeePageSize('abc')).toBe(20);
    expect(normalizeEmployeePageSize('30')).toBe(20);
    expect(normalizeEmployeePageSize('-10')).toBe(20);
  });

  it('calculates at least one total page', () => {
    expect(getEmployeeTotalPages(0, 20)).toBe(1);
    expect(getEmployeeTotalPages(1, 20)).toBe(1);
    expect(getEmployeeTotalPages(20, 20)).toBe(1);
    expect(getEmployeeTotalPages(21, 20)).toBe(2);
    expect(getEmployeeTotalPages(101, 50)).toBe(3);
  });

  it.each([
    [1, 1, [1]],
    [1, 10, [1, 2, 3, 4, 5]],
    [2, 10, [1, 2, 3, 4, 5]],
    [5, 10, [3, 4, 5, 6, 7]],
    [9, 10, [6, 7, 8, 9, 10]],
    [10, 10, [6, 7, 8, 9, 10]],
    [99, 3, [1, 2, 3]],
  ])(
    'returns bounded visible pages for current=%p total=%p',
    (current, total, expected) => {
      expect(
        getEmployeeVisiblePages(current as number, total as number),
      ).toEqual(expected);
    },
  );
});

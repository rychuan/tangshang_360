export const EMPLOYEE_PAGE_SIZES = [10, 20, 50, 100] as const;

export type EmployeePageSize = (typeof EMPLOYEE_PAGE_SIZES)[number];

export const DEFAULT_EMPLOYEE_PAGE_SIZE: EmployeePageSize = 20;

function toInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeEmployeePage(value: unknown): number {
  const page = toInteger(value);
  return page && page > 0 ? page : 1;
}

export function normalizeEmployeePageSize(value: unknown): EmployeePageSize {
  const pageSize = toInteger(value);
  return EMPLOYEE_PAGE_SIZES.includes(pageSize as EmployeePageSize)
    ? (pageSize as EmployeePageSize)
    : DEFAULT_EMPLOYEE_PAGE_SIZE;
}

export function getEmployeeTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function getEmployeeVisiblePages(
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): number[] {
  const boundedTotal = Math.max(1, Math.floor(totalPages));
  const visibleCount = Math.min(boundedTotal, Math.max(1, maxVisible));
  const boundedCurrent = Math.min(
    boundedTotal,
    Math.max(1, Math.floor(currentPage)),
  );
  const start = Math.max(
    1,
    Math.min(
      boundedCurrent - Math.floor(visibleCount / 2),
      boundedTotal - visibleCount + 1,
    ),
  );

  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

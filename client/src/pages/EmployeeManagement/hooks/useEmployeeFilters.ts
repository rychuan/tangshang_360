import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface EmployeeFilters {
  page: number;
  keyword: string;
  department: string;
  positions: string[];
  role: string;
  status: string;
}

export interface EmployeeFiltersSetters {
  setPage: (v: number) => void;
  setKeyword: (v: string) => void;
  setDepartment: (v: string) => void;
  setPositions: (v: string[]) => void;
  setRole: (v: string) => void;
  setStatus: (v: string) => void;
  resetFilters: () => void;
}

/**
 * URL 驱动的筛选状态。筛选条件持久化到 searchParams，
 * 任意非 page 参数变化时自动重置 page 为 1。
 */
export function useEmployeeFilters(): [
  EmployeeFilters,
  EmployeeFiltersSetters,
] {
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = (key: string, fallback: string): string =>
    searchParams.get(key) || fallback;

  const filters: EmployeeFilters = useMemo(
    () => ({
      page: parseInt(getParam('page', '1'), 10),
      keyword: getParam('keyword', ''),
      department: getParam('department', ''),
      positions: getParam('positions', '')
        ? getParam('positions', '').split(',')
        : [],
      role: getParam('role', ''),
      status: getParam('status', ''),
    }),
    [searchParams],
  );

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === '') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          if (key !== 'page') {
            next.set('page', '1');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setters: EmployeeFiltersSetters = useMemo(
    () => ({
      setPage: (v: number) => updateParam('page', String(v)),
      setKeyword: (v: string) => updateParam('keyword', v),
      setDepartment: (v: string) => updateParam('department', v),
      setPositions: (v: string[]) =>
        updateParam('positions', v.length > 0 ? v.join(',') : ''),
      setRole: (v: string) => updateParam('role', v),
      setStatus: (v: string) => updateParam('status', v),
      resetFilters: () =>
        setSearchParams(new URLSearchParams(), { replace: true }),
    }),
    [updateParam, setSearchParams],
  );

  return [filters, setters];
}

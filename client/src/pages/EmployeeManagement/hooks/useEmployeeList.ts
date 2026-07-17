import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { employeeManagement } from '@/api';
import type {
  EmployeeItem,
  BindingTemplateOption,
} from '@shared/api.interface';
import { handleApiError } from '@/utils/api-error';
import type { EmployeeFilters } from './useEmployeeFilters';

const PAGE_SIZE = 20;

interface UseEmployeeListReturn {
  employees: EmployeeItem[];
  total: number;
  loading: boolean;
  positions: string[];
  templates: BindingTemplateOption[];
  selectedRowKeys: string[];
  setSelectedRowKeys: Dispatch<SetStateAction<string[]>>;
  refetch: () => void;
}

/**
 * 封装员工列表数据获取逻辑。
 * 沿用项目现有的 useCallback + useEffect 模式，无外部数据获取库。
 */
export function useEmployeeList(
  filters: EmployeeFilters,
  options: { loadTemplates: boolean },
): UseEmployeeListReturn {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<BindingTemplateOption[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeeManagement.list({
        page: filters.page,
        pageSize: PAGE_SIZE,
        keyword: filters.keyword || undefined,
        department: filters.department || undefined,
        positions:
          filters.positions.length > 0
            ? filters.positions.join(',')
            : undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
        binding: filters.binding || undefined,
      });
      setEmployees(res.items);
      setTotal(res.total);
      setSelectedRowKeys([]);
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.keyword,
    filters.department,
    filters.positions,
    filters.role,
    filters.status,
  ]);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await employeeManagement.getPositions();
      setPositions(res.positions);
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!options.loadTemplates) {
      setTemplates([]);
      return;
    }
    try {
      const res = await employeeManagement.bindingTemplates();
      setTemplates(res.items);
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, [options.loadTemplates]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    employees,
    total,
    loading,
    positions,
    templates,
    selectedRowKeys,
    setSelectedRowKeys,
    refetch: fetchEmployees,
  };
}

import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { employeeManagement } from '@/api';
import { assessmentTemplate as templateApi } from '@/api';
import dictionaryApi from '@/api/dictionary';
import type {
  EmployeeItem,
  AssessmentTemplateItem,
} from '@shared/api.interface';
import { handleApiError } from '@/utils/api-error';
import type { EmployeeFilters } from './useEmployeeFilters';

const PAGE_SIZE = 20;

interface UseEmployeeListReturn {
  employees: EmployeeItem[];
  total: number;
  loading: boolean;
  positions: string[];
  templates: AssessmentTemplateItem[];
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
): UseEmployeeListReturn {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<AssessmentTemplateItem[]>([]);
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
      const res = await dictionaryApi('position').list();
      setPositions(res.items.map((p) => p.name));
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await templateApi.list({ page: 1, pageSize: 200 });
      setTemplates(res.items);
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, []);

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

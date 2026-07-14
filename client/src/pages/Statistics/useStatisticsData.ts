import { useState, useEffect, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@/utils/api-error';
import {
  getRecords,
  getCharts,
  type StatisticsRecordsParams,
  type StatisticsChartsParams,
} from '@/api/assessment-statistics';
import { getPositions } from '@/api/employee-management';
import { listActive } from '@/api/performance-grade';
import type {
  StatisticsRecordItem,
  ChartsResponse,
} from '@shared/api.interface';
import type { MultiSelectOption } from '@/components/ui/multi-select';

const DEFAULT_GRADE_OPTIONS: MultiSelectOption[] = [
  { label: 'S', value: 'S' },
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'C', value: 'C' },
  { label: 'D', value: 'D' },
];

export interface FilterState {
  periods: string[];
  departments: string[];
  positions: string[];
  grades: string[];
  employeeIds: string[];
}

export interface StatisticsData {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  records: StatisticsRecordItem[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  loading: boolean;
  charts: ChartsResponse | null;
  positionOptions: MultiSelectOption[];
  gradeSelectOptions: MultiSelectOption[];
  loadRecords: () => void;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function useStatisticsData(): StatisticsData {
  const [filters, setFilters] = useState<FilterState>({
    periods: [currentMonth()],
    departments: [],
    positions: [],
    grades: [],
    employeeIds: [],
  });
  const [positionOptions, setPositionOptions] = useState<MultiSelectOption[]>(
    [],
  );
  const [records, setRecords] = useState<StatisticsRecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [charts, setCharts] = useState<ChartsResponse | null>(null);
  const [gradeSelectOptions, setGradeSelectOptions] = useState<
    MultiSelectOption[]
  >(DEFAULT_GRADE_OPTIONS);

  const buildParams = useCallback(
    (p: number): StatisticsRecordsParams => ({
      page: p,
      pageSize,
      periods: filters.periods.length > 0 ? filters.periods : undefined,
      departments:
        filters.departments.length > 0 ? filters.departments : undefined,
      positions: filters.positions.length > 0 ? filters.positions : undefined,
      grades: filters.grades.length > 0 ? filters.grades : undefined,
      employeeIds:
        filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
    }),
    [filters],
  );

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getRecords(buildParams(page));
      setRecords(res?.items ?? []);
      setTotal(res.total);
    } catch (e: unknown) {
      logger.error(
        'Statistics records load error',
        e instanceof Error ? e : undefined,
      );
      handleApiError(e);
    } finally {
      setLoading(false);
    }
  }, [buildParams, page]);

  const loadCharts = useCallback(async () => {
    try {
      const chartParams: StatisticsChartsParams = {
        periods: filters.periods.length > 0 ? filters.periods : undefined,
        departments:
          filters.departments.length > 0 ? filters.departments : undefined,
        positions: filters.positions.length > 0 ? filters.positions : undefined,
        grades: filters.grades.length > 0 ? filters.grades : undefined,
      };
      const res = await getCharts(chartParams);
      setCharts(res);
    } catch (e: unknown) {
      logger.error(
        'Statistics charts load error',
        e instanceof Error ? e : undefined,
      );
    }
  }, [filters.periods, filters.departments, filters.positions, filters.grades]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);
  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  useEffect(() => {
    getPositions()
      .then((res) =>
        setPositionOptions(
          res.positions.map((p: string) => ({ label: p, value: p })),
        ),
      )
      .catch((err: unknown) =>
        logger.error(
          'Failed to load positions',
          err instanceof Error ? err : undefined,
        ),
      );
  }, []);

  useEffect(() => {
    listActive()
      .then((res) => {
        if (res?.rules?.length) {
          const names = [
            ...new Set(res.rules.map((r: { name: string }) => r.name)),
          ];
          setGradeSelectOptions(names.map((n) => ({ label: n, value: n })));
        }
      })
      .catch(() => {});
  }, []);

  return {
    filters,
    setFilters,
    records,
    total,
    page,
    setPage,
    pageSize,
    loading,
    charts,
    positionOptions,
    gradeSelectOptions,
    loadRecords,
  };
}

import React, { useEffect, useState, useCallback } from 'react';
import {
  DownloadIcon,
  SearchIcon,
  BarChart3Icon,
  PieChartIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { handleApiError } from '@/utils/api-error';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/business-ui/page-header';
import {
  StatusBadge,
  GradeBadge,
  ASSESSMENT_STATUS_LABELS,
} from '@/components/business-ui/status-badge';
import { UserSelect } from '@client/src/components/business-ui/user-select';
import MultiMonthPicker from '@/components/ui/multi-month-picker';
import MultiDepartmentTreeSelect from '@/components/ui/multi-department-tree-select';
import MultiSelect, {
  type MultiSelectOption,
} from '@/components/ui/multi-select';
import { Spinner } from '@/components/ui/spinner';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import {
  getRecords,
  getCharts,
  exportData,
  type StatisticsRecordsParams,
  type StatisticsChartsParams,
} from '@/api/assessment-statistics';
import { getPositions } from '@/api/employee-management';
import type {
  StatisticsRecordItem,
  ChartsResponse,
} from '@shared/api.interface';

const GRADE_OPTIONS = ['S', 'A', 'B', 'C', 'D'] as const;
const GRADE_SELECT_OPTIONS: MultiSelectOption[] = GRADE_OPTIONS.map(
  (g: string) => ({ label: g, value: g }),
);

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface FilterState {
  periods: string[];
  departments: string[];
  positions: string[];
  grades: string[];
  employeeIds: string[];
}

const chartConfig = {
  count: { label: '人数', color: 'hsl(var(--chart-1))' },
  score: { label: '平均分', color: 'hsl(var(--chart-2))' },
  avgScore: { label: '平均分', color: 'hsl(var(--chart-3))' },
};

const StatisticsPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({
    periods: [],
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
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [charts, setCharts] = useState<ChartsResponse | null>(null);
  const [exporting, setExporting] = useState(false);

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
    [filters, pageSize],
  );

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getRecords(buildParams(page));
      setRecords(res?.items ?? []);
      setTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败';
      logger.error(`Statistics records load error: ${msg}`);
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
      const msg = e instanceof Error ? e.message : '加载图表失败';
      logger.error(`Statistics charts load error: ${msg}`);
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
      .then((res: { positions: string[] }) => {
        setPositionOptions(
          res.positions.map((p: string) => ({ label: p, value: p })),
        );
      })
      .catch((err: unknown) =>
        logger.error('Failed to load positions', err as Error),
      );
  }, []);

  const handleSearch = () => setPage(1);

  const handleExport = async () => {
    try {
      setExporting(true);
      const data = await exportData({
        periods: filters.periods.length > 0 ? filters.periods : undefined,
        departments:
          filters.departments.length > 0 ? filters.departments : undefined,
        positions: filters.positions.length > 0 ? filters.positions : undefined,
        grades: filters.grades.length > 0 ? filters.grades : undefined,
        employeeIds:
          filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
      });
      if (data.length === 0) {
        toast.warning('没有可导出的数据');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        data.map((r: StatisticsRecordItem) => ({
          考核周期: r.period,
          员工姓名: r.employeeName,
          部门: r.department,
          岗位: r.position,
          上级: r.supervisorName,
          总分: r.totalScore,
          等级: r.grade,
          状态: ASSESSMENT_STATUS_LABELS[r.status] || r.status,
          完成时间: r.completedAt || '',
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '考核记录');
      XLSX.writeFile(wb, '考核记录导出.xlsx');
      toast.success(`导出成功，共 ${data.length} 条记录`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '导出失败';
      logger.error(`Export error: ${msg}`);
      handleApiError(e);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader title="考核统计查询" visuallyHidden />

      {/* Filters */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">考核周期</label>
              <MultiMonthPicker
                value={filters.periods}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, periods: value }))
                }
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">部门</label>
              <MultiDepartmentTreeSelect
                value={filters.departments}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, departments: value }))
                }
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">岗位</label>
              <MultiSelect
                options={positionOptions}
                value={filters.positions}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, positions: value }))
                }
                placeholder="选择岗位"
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">等级</label>
              <MultiSelect
                options={GRADE_SELECT_OPTIONS}
                value={filters.grades}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, grades: value }))
                }
                placeholder="选择等级"
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">选择员工</label>
              <UserSelect
                multiple
                placeholder="选择员工"
                value={filters.employeeIds}
                onChange={(value: string[]) =>
                  setFilters((f: FilterState) => ({ ...f, employeeIds: value }))
                }
                className="w-40"
              />
            </div>
            <Button onClick={handleSearch} className="flex items-center gap-1">
              <SearchIcon className="size-4" />
              查询
            </Button>
            <CanRole roles={['admin', 'hrd', 'dept_head']}>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1"
              >
                <DownloadIcon className="size-4" />
                {exporting ? '导出中...' : '导出'}
              </Button>
            </CanRole>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Grade Distribution - Pie Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChartIcon className="size-4 text-muted-foreground" />
              等级分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.gradeDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <PieChart>
                  <Pie
                    data={charts.gradeDistribution}
                    dataKey="count"
                    nameKey="grade"
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {charts.gradeDistribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Department Avg - Bar Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3Icon className="size-4 text-muted-foreground" />
              部门平均分
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.departmentAvg.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart
                  data={[...charts.departmentAvg].sort(
                    (a, b) => b.avgScore - a.avgScore,
                  )}
                  layout="vertical"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    width={80}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="avgScore"
                    fill="hsl(var(--chart-1))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Trend - Area Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-muted-foreground" />
              月度趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!charts || charts.trend.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <AreaChart data={charts.trend}>
                  <defs>
                    <linearGradient id="fillTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--chart-3))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--chart-3))"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="avgScore"
                    fill="url(#fillTrend)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">考核记录（共 {total} 条）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="size-8" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 pr-4 font-medium">
                        考核周期
                      </th>
                      <th className="text-left py-3 pr-4 font-medium">员工</th>
                      <th className="text-left py-3 pr-4 font-medium hidden sm:table-cell">
                        部门
                      </th>
                      <th className="text-left py-3 pr-4 font-medium hidden md:table-cell">
                        岗位
                      </th>
                      <th className="text-left py-3 pr-4 font-medium hidden md:table-cell">
                        上级
                      </th>
                      <th className="text-right py-3 pr-4 font-medium">总分</th>
                      <th className="text-center py-3 pr-4 font-medium hidden sm:table-cell">
                        等级
                      </th>
                      <th className="text-center py-3 pr-4 font-medium">
                        状态
                      </th>
                      <th className="text-left py-3 pr-4 font-medium hidden lg:table-cell">
                        完成时间
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r: StatisticsRecordItem) => (
                      <tr key={r.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 pr-4">{r.period}</td>
                        <td className="py-3 pr-4 font-medium">
                          {r.employeeName}
                        </td>
                        <td className="py-3 pr-4 hidden sm:table-cell text-muted-foreground">
                          {r.department}
                        </td>
                        <td className="py-3 pr-4 hidden md:table-cell text-muted-foreground">
                          {r.position}
                        </td>
                        <td className="py-3 pr-4 hidden md:table-cell text-muted-foreground">
                          {r.supervisorName}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono">
                          {r.totalScore}
                        </td>
                        <td className="py-3 pr-4 text-center hidden sm:table-cell">
                          <GradeBadge grade={r.grade} />
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="py-3 pr-4 hidden lg:table-cell text-muted-foreground">
                          {r.completedAt
                            ? new Date(r.completedAt).toLocaleDateString(
                                'zh-CN',
                              )
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    第 {page} / {totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((p: number) => Math.min(totalPages, p + 1))
                      }
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StatisticsPage;

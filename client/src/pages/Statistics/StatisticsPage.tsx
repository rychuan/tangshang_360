import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DownloadIcon,
  SearchIcon,
  BarChart3Icon,
  PieChartIcon,
  TrendingUpIcon,
  Eye,
  FileDown,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { handleApiError } from '@/utils/api-error';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { detail as getAssessmentDetail } from '@/api/assessment-operation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const navigate = useNavigate();
  const pdfRef = useRef<HTMLDivElement>(null);

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
          绩效周期: r.period,
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
      XLSX.utils.book_append_sheet(wb, ws, '绩效记录');
      XLSX.writeFile(wb, '绩效记录导出.xlsx');
      toast.success(`导出成功，共 ${data.length} 条记录`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '导出失败';
      logger.error(`Export error: ${msg}`);
      handleApiError(e);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async (
    id: string,
    employeeName: string,
    period: string,
  ) => {
    try {
      setExportingPdfId(id);
      const detail = await getAssessmentDetail(id);
      const pdfEl = pdfRef.current;
      if (!pdfEl) return;

      // Render detail to hidden div
      const content = `
        <div style="padding:20px;font-family:sans-serif;max-width:700px;">
          <h2 style="margin-bottom:16px;">绩效详情</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">员工</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.employeeName}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">岗位</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.position}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">周期</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.period}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">状态</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.status}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">总分</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.totalScore ?? '-'}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">等级</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.grade ?? '-'}</td></tr>
            <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">上级</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.supervisorName}</td><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">自评签名</td><td style="padding:4px 8px;border:1px solid #ddd;">${detail.selfSignName || '-'}</td></tr>
          </table>
          <h3 style="margin-bottom:8px;">考核指标</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">维度</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">指标</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">权重</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">自评</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">上级评分</th>
              </tr>
            </thead>
            <tbody>
              ${detail.indicators
                .map(
                  (ind) => `
                <tr>
                  <td style="padding:6px;border:1px solid #ddd;">${ind.dimensionName}</td>
                  <td style="padding:6px;border:1px solid #ddd;">${ind.content}</td>
                  <td style="padding:6px;border:1px solid #ddd;text-align:right;">${ind.weight}</td>
                  <td style="padding:6px;border:1px solid #ddd;text-align:right;">${ind.selfScore ?? '-'}</td>
                  <td style="padding:6px;border:1px solid #ddd;text-align:right;">${ind.supervisorScore ?? '-'}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
      pdfEl.innerHTML = content;

      // Wait for render
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(pdfEl, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297; // A4 height

      while (heightLeft > 0) {
        position = position - 297;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      pdf.save(`绩效详情_${employeeName}_${period}.pdf`);
      pdfEl.innerHTML = '';
      toast.success('PDF 导出成功');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'PDF 导出失败';
      logger.error(`PDF export error: ${msg}`);
      handleApiError(e);
    } finally {
      setExportingPdfId(null);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader title="绩效统计查询" visuallyHidden />

      {/* Filters */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">绩效周期</label>
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
              <SearchIcon data-icon="inline-start" />
              查询
            </Button>
            <CanRole roles={['admin', 'hrd', 'dept_head']}>
              <CanDo resource="statistics" action="export">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex items-center gap-1"
                >
                  <DownloadIcon data-icon="inline-start" />
                  {exporting ? '导出中...' : '导出'}
                </Button>
              </CanDo>
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
          <CardTitle className="text-base">绩效记录（共 {total} 条）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="size-8" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BarChart3Icon className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无数据</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-left py-3 px-4 font-medium">
                        绩效周期
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium">
                        员工
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden sm:table-cell">
                        部门
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden md:table-cell">
                        岗位
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden md:table-cell">
                        上级
                      </TableHead>
                      <TableHead className="text-right py-3 px-4 font-medium">
                        总分
                      </TableHead>
                      <TableHead className="text-center py-3 px-4 font-medium hidden sm:table-cell">
                        等级
                      </TableHead>
                      <TableHead className="text-center py-3 px-4 font-medium">
                        状态
                      </TableHead>
                      <TableHead className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                        完成时间
                      </TableHead>
                      <CanRole roles={['admin', 'hrd', 'dept_head']}>
                        <TableHead className="text-center py-3 px-4 font-medium w-20">
                          操作
                        </TableHead>
                      </CanRole>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r: StatisticsRecordItem) => (
                      <TableRow
                        key={r.id}
                        className="border-b hover:bg-muted/50"
                      >
                        <TableCell className="py-3 px-4">{r.period}</TableCell>
                        <TableCell className="py-3 px-4 font-medium">
                          {r.employeeName}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden sm:table-cell text-muted-foreground">
                          {r.department}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                          {r.position}
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                          {r.supervisorName}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right font-mono">
                          {r.totalScore}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center hidden sm:table-cell">
                          <GradeBadge grade={r.grade} />
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="py-3 px-4 hidden lg:table-cell text-muted-foreground">
                          {r.completedAt
                            ? new Date(r.completedAt).toLocaleDateString(
                                'zh-CN',
                              )
                            : '-'}
                        </TableCell>
                        <CanRole roles={['admin', 'hrd', 'dept_head']}>
                          <TableCell className="py-3 px-1 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="查看详情"
                                onClick={() => navigate(`assessment/${r.id}`)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="导出PDF"
                                disabled={exportingPdfId === r.id}
                                onClick={() =>
                                  handleExportPdf(
                                    r.id,
                                    r.employeeName,
                                    r.period,
                                  )
                                }
                              >
                                <FileDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </CanRole>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

      {/* Hidden div for PDF rendering */}
      <div
        ref={pdfRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '700px',
          background: '#fff',
        }}
      />
    </div>
  );
};

export default StatisticsPage;
